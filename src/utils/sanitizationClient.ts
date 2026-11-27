import { createPseudonymSession, sanitizeText } from '../engine';
import type { DetectionResult } from '../types/detection';
import type { CsvSanitizationResult } from '../types/file';
import type { RedactionResult } from '../types/redaction';
import type { PiiCategory, RedactionMode } from '../types/ui';
import type {
  WorkerSanitizeRequest,
  WorkerSanitizeResponse,
} from '../types/worker';
import { sanitizeCsvText } from './csvProcessor';

export const WORKER_THRESHOLD_CHARS = 50_000;

export interface SanitizeTextAsyncOutput {
  readonly detection: DetectionResult;
  readonly redaction: RedactionResult;
  readonly usedWorker: boolean;
}

export interface SanitizeCsvAsyncOutput {
  readonly result: CsvSanitizationResult;
  readonly usedWorker: boolean;
}

export interface SanitizationClient {
  sanitizeTextAsync(
    text: string,
    mode: RedactionMode,
    enabledCategories?: ReadonlySet<PiiCategory>,
  ): Promise<SanitizeTextAsyncOutput>;
  sanitizeCsvAsync(
    csvText: string,
    mode: RedactionMode,
    enabledCategories?: ReadonlySet<PiiCategory>,
  ): Promise<SanitizeCsvAsyncOutput>;
  clearSession(): void;
  dispose(): void;
}

interface PendingTextRequest {
  readonly kind: 'text';
  readonly resolve: (value: SanitizeTextAsyncOutput) => void;
  readonly reject: (reason: Error) => void;
}

interface PendingCsvRequest {
  readonly kind: 'csv';
  readonly resolve: (value: SanitizeCsvAsyncOutput) => void;
  readonly reject: (reason: Error) => void;
}

type PendingRequest = PendingTextRequest | PendingCsvRequest;

export interface CreateSanitizationClientOptions {
  readonly thresholdChars?: number;
}

function serializeEnabledCategories(
  enabledCategories?: ReadonlySet<PiiCategory>,
): PiiCategory[] | undefined {
  return enabledCategories !== undefined
    ? Array.from(enabledCategories)
    : undefined;
}

/**
 * Creates a client-side sanitization coordinator that executes small inputs
 * synchronously and offloads large inputs (>= thresholdChars) to a local
 * module Web Worker while correlating concurrent runs by requestId.
 */
export function createSanitizationClient(
  options: CreateSanitizationClientOptions = {},
): SanitizationClient {
  const thresholdChars = options.thresholdChars ?? WORKER_THRESHOLD_CHARS;
  const syncSession = createPseudonymSession();
  const pending = new Map<number, PendingRequest>();

  let worker: Worker | null = null;
  let nextRequestId = 0;
  let disposed = false;

  function rejectAllPending(reason: string): void {
    for (const entry of pending.values()) {
      entry.reject(new Error(reason));
    }
    pending.clear();
  }

  function teardownWorker(): void {
    if (!worker) {
      return;
    }
    worker.removeEventListener('message', handleWorkerMessage);
    worker.removeEventListener('error', handleWorkerError);
    worker.terminate();
    worker = null;
  }

  function handleWorkerMessage(
    event: MessageEvent<WorkerSanitizeResponse>,
  ): void {
    const data = event.data;
    const entry = pending.get(data.requestId);
    if (!entry) {
      return;
    }
    pending.delete(data.requestId);

    if (data.type === 'error') {
      entry.reject(new Error(data.error));
      return;
    }

    if (data.type === 'text-result' && entry.kind === 'text') {
      entry.resolve({
        detection: data.detection,
        redaction: data.redaction,
        usedWorker: true,
      });
      return;
    }

    if (data.type === 'csv-result' && entry.kind === 'csv') {
      entry.resolve({
        result: data.result,
        usedWorker: true,
      });
      return;
    }

    entry.reject(new Error('Mismatched local worker response type.'));
  }

  function handleWorkerError(): void {
    rejectAllPending('Local worker execution failed.');
    teardownWorker();
  }

  function getOrCreateWorker(): Worker | null {
    if (disposed || typeof Worker === 'undefined') {
      return null;
    }

    if (!worker) {
      worker = new Worker(
        new URL('../workers/sanitizationWorker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.addEventListener('message', handleWorkerMessage);
      worker.addEventListener('error', handleWorkerError);
    }

    return worker;
  }

  function runWithWorker<TOutput>(
    inputLength: number,
    registerPending: (
      requestId: number,
      resolve: (value: TOutput) => void,
      reject: (reason: Error) => void,
    ) => WorkerSanitizeRequest,
    runSync: () => TOutput,
  ): Promise<TOutput> {
    if (disposed) {
      return Promise.reject(new Error('Sanitization client has been disposed.'));
    }

    if (inputLength >= thresholdChars) {
      const activeWorker = getOrCreateWorker();
      if (activeWorker) {
        nextRequestId += 1;
        const requestId = nextRequestId;
        return new Promise<TOutput>((resolve, reject) => {
          const message = registerPending(requestId, resolve, reject);
          activeWorker.postMessage(message);
        });
      }
    }

    return Promise.resolve(runSync());
  }

  return {
    sanitizeTextAsync(
      text: string,
      mode: RedactionMode,
      enabledCategories?: ReadonlySet<PiiCategory>,
    ): Promise<SanitizeTextAsyncOutput> {
      const serializedCategories =
        serializeEnabledCategories(enabledCategories);

      return runWithWorker<SanitizeTextAsyncOutput>(
        text.length,
        (requestId, resolve, reject) => {
          pending.set(requestId, { kind: 'text', resolve, reject });
          return {
            type: 'sanitize-text',
            requestId,
            text,
            mode,
            ...(serializedCategories !== undefined
              ? { enabledCategories: serializedCategories }
              : {}),
          };
        },
        (): SanitizeTextAsyncOutput => {
          const { detection, redaction } = sanitizeText(text, {
            mode,
            pseudonymSession: syncSession,
            ...(enabledCategories !== undefined ? { enabledCategories } : {}),
          });
          return {
            detection,
            redaction,
            usedWorker: false,
          };
        },
      );
    },

    sanitizeCsvAsync(
      csvText: string,
      mode: RedactionMode,
      enabledCategories?: ReadonlySet<PiiCategory>,
    ): Promise<SanitizeCsvAsyncOutput> {
      const serializedCategories =
        serializeEnabledCategories(enabledCategories);

      return runWithWorker<SanitizeCsvAsyncOutput>(
        csvText.length,
        (requestId, resolve, reject) => {
          pending.set(requestId, { kind: 'csv', resolve, reject });
          return {
            type: 'sanitize-csv',
            requestId,
            csvText,
            mode,
            ...(serializedCategories !== undefined
              ? { enabledCategories: serializedCategories }
              : {}),
          };
        },
        (): SanitizeCsvAsyncOutput => ({
          result: sanitizeCsvText(csvText, {
            mode,
            pseudonymSession: syncSession,
            ...(enabledCategories !== undefined ? { enabledCategories } : {}),
          }),
          usedWorker: false,
        }),
      );
    },

    clearSession(): void {
      syncSession.clear();
      rejectAllPending('Sanitization session cleared.');
      if (worker) {
        worker.postMessage({
          type: 'clear-session',
        } satisfies WorkerSanitizeRequest);
      }
    },

    dispose(): void {
      disposed = true;
      syncSession.clear();
      rejectAllPending('Sanitization client disposed.');
      teardownWorker();
    },
  };
}
