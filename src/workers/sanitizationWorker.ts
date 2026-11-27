import { createPseudonymSession, sanitizeText } from '../engine';
import type {
  WorkerSanitizeRequest,
  WorkerSanitizeResponse,
} from '../types/worker';
import { sanitizeCsvText } from '../utils/csvProcessor';

interface SanitizationWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerSanitizeRequest>) => void,
  ): void;
  postMessage(message: WorkerSanitizeResponse): void;
}

const session = createPseudonymSession();
const workerScope = globalThis as unknown as SanitizationWorkerScope;

function postResponse(response: WorkerSanitizeResponse): void {
  workerScope.postMessage(response);
}

/**
 * Processes sanitization and session-reset messages inside the local
 * Web Worker scope without touching network or persistent storage APIs.
 */
export function handleWorkerRequest(message: WorkerSanitizeRequest): void {
  if (message.type === 'clear-session') {
    session.clear();
    return;
  }

  const enabledCategories =
    message.enabledCategories !== undefined
      ? new Set(message.enabledCategories)
      : undefined;

  switch (message.type) {
    case 'sanitize-text': {
      try {
        const { detection, redaction } = sanitizeText(message.text, {
          mode: message.mode,
          pseudonymSession: session,
          ...(enabledCategories !== undefined ? { enabledCategories } : {}),
        });
        postResponse({
          type: 'text-result',
          requestId: message.requestId,
          detection,
          redaction,
        });
      } catch {
        postResponse({
          type: 'error',
          requestId: message.requestId,
          error: 'Unable to sanitize text inside local worker.',
        });
      }
      return;
    }
    case 'sanitize-csv': {
      try {
        const result = sanitizeCsvText(message.csvText, {
          mode: message.mode,
          pseudonymSession: session,
          ...(enabledCategories !== undefined ? { enabledCategories } : {}),
        });
        postResponse({
          type: 'csv-result',
          requestId: message.requestId,
          result,
        });
      } catch {
        postResponse({
          type: 'error',
          requestId: message.requestId,
          error: 'Unable to sanitize CSV inside local worker.',
        });
      }
      return;
    }
  }
}

if (typeof workerScope.addEventListener === 'function') {
  workerScope.addEventListener('message', (event) => {
    handleWorkerRequest(event.data);
  });
}
