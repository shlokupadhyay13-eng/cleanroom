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
    if (worker) {
      worker.terminate();
      worker = null;
    }
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

  function postToWorker(message: WorkerSanitizeRequest): void {
    worker?.postMessage(message);
  }

  return {
    sanitizeTextAsync(
      text: string,
      mode: RedactionMode,
      enabledCategories?: ReadonlySet<PiiCategory>,
    ): Promise<SanitizeTextAsyncOutput> {
      if (disposed) {
        return Promise.reject(new Error('Sanitization client has been disposed.'));
      }

      if (text.length >= thresholdChars) {
        const activeWorker = getOrCreateWorker();
        if (activeWorker) {
          nextRequestId += 1;
          const requestId = nextRequestId;
          const serializedCategories =
            enabledCategories !== undefined
              ? Array.from(enabledCategories)
              : undefined;

          return new Promise<SanitizeTextAsyncOutput>((resolve, reject) => {
            pending.set(requestId, { kind: 'text', resolve, reject });
            activeWorker.postMessage({
              type: 'sanitize-text',
              requestId,
              text,
              mode,
              ...(serializedCategories !== undefined
                ? { enabledCategories: serializedCategories }
                : {}),
            } satisfies WorkerSanitizeRequest);
          });
        }
      }

      const { detection, redaction } = sanitizeText(text, {
        mode,
        pseudonymSession: syncSession,
        ...(enabledCategories !== undefined ? { enabledCategories } : {}),
      });
      return Promise.resolve({
        detection,
        redaction,
        usedWorker: false,
      });
    },

    sanitizeCsvAsync(
      csvText: string,
      mode: RedactionMode,
      enabledCategories?: ReadonlySet<PiiCategory>,
    ): Promise<SanitizeCsvAsyncOutput> {
      if (disposed) {
        return Promise.reject(new Error('Sanitization client has been disposed.'));
      }

      if (csvText.length >= thresholdChars) {
        const activeWorker = getOrCreateWorker();
        if (activeWorker) {
          nextRequestId += 1;
          const requestId = nextRequestId;
          const serializedCategories =
            enabledCategories !== undefined
              ? Array.from(enabledCategories)
              : undefined;

          return new Promise<SanitizeCsvAsyncOutput>((resolve, reject) => {
            pending.set(requestId, { kind: 'csv', resolve, reject });
            activeWorker.postMessage({
              type: 'sanitize-csv',
              requestId,
              csvText,
              mode,
              ...(serializedCategories !== undefined
                ? { enabledCategories: serializedCategories }
                : {}),
            } satisfies WorkerSanitizeRequest);
          });
        }
      }

      const result = sanitizeCsvText(csvText, {
        mode,
        pseudonymSession: syncSession,
        ...(enabledCategories !== undefined ? { enabledCategories } : {}),
      });
      return Promise.resolve({
        result,
        usedWorker: false,
      });
    },

    clearSession(): void {
      syncSession.clear();
      rejectAllPending('Sanitization session cleared.');
      if (worker) {
        postToWorker({ type: 'clear-session' });
      }
    },

    dispose(): void {
      disposed = true;
      syncSession.clear();
      rejectAllPending('Sanitization client disposed.');
      if (worker) {
        worker.removeEventListener('message', handleWorkerMessage);
        worker.removeEventListener('error', handleWorkerError);
        worker.terminate();
        worker = null;
      }
    },
  };
}
