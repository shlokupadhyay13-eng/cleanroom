import type { DetectionResult } from './detection';
import type { CsvSanitizationResult } from './file';
import type { RedactionResult } from './redaction';
import type { RedactionMode, PiiCategory } from './ui';

export type WorkerSanitizeRequest =
  | {
      readonly type: 'sanitize-text';
      readonly requestId: number;
      readonly text: string;
      readonly mode: RedactionMode;
      readonly enabledCategories?: PiiCategory[];
    }
  | {
      readonly type: 'sanitize-csv';
      readonly requestId: number;
      readonly csvText: string;
      readonly mode: RedactionMode;
      readonly enabledCategories?: PiiCategory[];
    }
  | {
      readonly type: 'clear-session';
    };

export type WorkerSanitizeResponse =
  | {
      readonly type: 'text-result';
      readonly requestId: number;
      readonly detection: DetectionResult;
      readonly redaction: RedactionResult;
    }
  | {
      readonly type: 'csv-result';
      readonly requestId: number;
      readonly result: CsvSanitizationResult;
    }
  | {
      readonly type: 'error';
      readonly requestId: number;
      readonly error: string;
    };
