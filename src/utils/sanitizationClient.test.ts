import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  WorkerSanitizeRequest,
  WorkerSanitizeResponse,
} from '../types/worker';
import { handleWorkerRequest } from '../workers/sanitizationWorker';
import {
  WORKER_THRESHOLD_CHARS,
  createSanitizationClient,
} from './sanitizationClient';

class MockWorker {
  static instances: MockWorker[] = [];
  private listeners = new Map<
    string,
    Set<(event: MessageEvent<WorkerSanitizeResponse>) => void>
  >();
  public postedMessages: WorkerSanitizeRequest[] = [];
  public terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<WorkerSanitizeResponse>) => void,
  ): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<WorkerSanitizeResponse>) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: WorkerSanitizeRequest): void {
    this.postedMessages.push(message);

    // Execute real worker message handler synchronously for deterministic testing.
    const previousPost = globalThis.postMessage;
    const emit = (response: WorkerSanitizeResponse) => {
      const listeners = this.listeners.get('message');
      if (!listeners) {
        return;
      }
      for (const listener of listeners) {
        listener({ data: response } as MessageEvent<WorkerSanitizeResponse>);
      }
    };

    Object.defineProperty(globalThis, 'postMessage', {
      value: emit,
      configurable: true,
    });
    try {
      handleWorkerRequest(message);
    } finally {
      Object.defineProperty(globalThis, 'postMessage', {
        value: previousPost,
        configurable: true,
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('sanitizationClient', () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    MockWorker.instances = [];
    Object.defineProperty(globalThis, 'Worker', {
      value: originalWorker,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('runs small inputs synchronously without instantiating a Worker and preserves session until clearSession()', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const client = createSanitizationClient();

    const first = await client.sanitizeTextAsync(
      'Contact john@example.com',
      'pseudonymize',
    );
    expect(first.usedWorker).toBe(false);
    expect(first.redaction.sanitizedText).toBe('Contact [EMAIL_001]');
    expect(MockWorker.instances).toHaveLength(0);

    const second = await client.sanitizeTextAsync(
      'Repeat john@example.com and jane@example.com',
      'pseudonymize',
    );
    expect(second.usedWorker).toBe(false);
    expect(second.redaction.sanitizedText).toBe(
      'Repeat [EMAIL_001] and [EMAIL_002]',
    );

    client.clearSession();
    const afterClear = await client.sanitizeTextAsync(
      'Fresh jane@example.com',
      'pseudonymize',
    );
    expect(afterClear.redaction.sanitizedText).toBe('Fresh [EMAIL_001]');

    client.dispose();
  });

  it('routes large inputs (>= WORKER_THRESHOLD_CHARS) to the local Worker and terminates on dispose()', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const client = createSanitizationClient();

    const padding = 'x'.repeat(WORKER_THRESHOLD_CHARS);
    const largeText = `Email alice@example.com ${padding}`;

    const textOutput = await client.sanitizeTextAsync(largeText, 'full');
    expect(textOutput.usedWorker).toBe(true);
    expect(textOutput.redaction.totalSanitized).toBe(1);
    expect(textOutput.redaction.sanitizedText.startsWith('Email [REDACTED]')).toBe(
      true,
    );
    expect(MockWorker.instances).toHaveLength(1);

    const largeCsv = `name,email\nAlice,alice@example.com\n${padding.slice(0, WORKER_THRESHOLD_CHARS)},a@b.co`;
    const csvOutput = await client.sanitizeCsvAsync(largeCsv, 'partial');
    expect(csvOutput.usedWorker).toBe(true);
    expect(csvOutput.result.ok).toBe(true);

    client.clearSession();
    expect(
      MockWorker.instances[0]?.postedMessages.some(
        (msg) => msg.type === 'clear-session',
      ),
    ).toBe(true);

    client.dispose();
    expect(MockWorker.instances[0]?.terminated).toBe(true);
  });

  it('falls back gracefully to synchronous execution when Worker is unavailable', async () => {
    Object.defineProperty(globalThis, 'Worker', {
      value: undefined,
      configurable: true,
    });

    const client = createSanitizationClient();
    const largeText = `Email alice@example.com ${'a'.repeat(WORKER_THRESHOLD_CHARS)}`;

    const output = await client.sanitizeTextAsync(largeText, 'full');
    expect(output.usedWorker).toBe(false);
    expect(output.redaction.totalSanitized).toBe(1);
    expect(output.redaction.sanitizedText.startsWith('Email [REDACTED]')).toBe(
      true,
    );

    client.dispose();
  });

  it('isolates out-of-order worker responses by requestId and handles worker errors cleanly', async () => {
    const queued: Array<{
      message: WorkerSanitizeRequest;
      emit: (response: WorkerSanitizeResponse) => void;
    }> = [];

    class OutOfOrderMockWorker {
      private listeners = new Map<
        string,
        Set<(event: Event | MessageEvent<WorkerSanitizeResponse>) => void>
      >();

      addEventListener(
        type: string,
        listener: (event: Event | MessageEvent<WorkerSanitizeResponse>) => void,
      ): void {
        const existing = this.listeners.get(type) ?? new Set();
        existing.add(listener);
        this.listeners.set(type, existing);
      }

      removeEventListener(): void {}

      postMessage(message: WorkerSanitizeRequest): void {
        const emit = (response: WorkerSanitizeResponse) => {
          for (const listener of this.listeners.get('message') ?? []) {
            listener({ data: response } as MessageEvent<WorkerSanitizeResponse>);
          }
        };

        if (message.type === 'sanitize-text' && message.text.includes('TRIGGER_ERROR')) {
          for (const listener of this.listeners.get('error') ?? []) {
            listener(new Event('error'));
          }
          return;
        }

        if (message.type !== 'clear-session') {
          queued.push({ message, emit });
        }
      }

      terminate(): void {}
    }

    vi.stubGlobal('Worker', OutOfOrderMockWorker);
    const client = createSanitizationClient({ thresholdChars: 10 });

    const firstPromise = client.sanitizeTextAsync(
      'first@example.com padding',
      'full',
    );
    const secondPromise = client.sanitizeTextAsync(
      'second@example.com padding',
      'partial',
    );

    expect(queued).toHaveLength(2);

    // Emit response 2 before response 1.
    const previousPost = globalThis.postMessage;
    const secondItem = queued[1]!;
    const firstItem = queued[0]!;

    Object.defineProperty(globalThis, 'postMessage', {
      value: secondItem.emit,
      configurable: true,
    });
    handleWorkerRequest(secondItem.message);

    Object.defineProperty(globalThis, 'postMessage', {
      value: firstItem.emit,
      configurable: true,
    });
    handleWorkerRequest(firstItem.message);

    Object.defineProperty(globalThis, 'postMessage', {
      value: previousPost,
      configurable: true,
    });

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    expect(firstResult.redaction.sanitizedText).toBe('[REDACTED] padding');
    expect(secondResult.redaction.sanitizedText).toBe(
      's***@example.com padding',
    );

    await expect(
      client.sanitizeTextAsync('TRIGGER_ERROR padding', 'full'),
    ).rejects.toThrow(/Local worker execution failed/i);

    client.dispose();
  });

  it('forwards enabledCategories across worker requests and rejects calls after dispose()', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const client = createSanitizationClient({ thresholdChars: 10 });

    const result = await client.sanitizeTextAsync(
      'Email alice@example.com and PAN ABCPE1234F',
      'full',
      new Set(['pan']),
    );
    expect(result.usedWorker).toBe(true);
    expect(result.redaction.sanitizedText).toBe(
      'Email alice@example.com and PAN [REDACTED]',
    );

    client.dispose();
    await expect(
      client.sanitizeTextAsync('alice@example.com', 'full'),
    ).rejects.toThrow(/disposed/i);
    await expect(
      client.sanitizeCsvAsync('a,b\n1,2', 'full'),
    ).rejects.toThrow(/disposed/i);
  });
});
