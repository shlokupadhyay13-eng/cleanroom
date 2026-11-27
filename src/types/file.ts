import type { DetectedEntity } from './detection';
import type { RedactedEntity } from './redaction';
import type { CategoryCounts, RedactionMode } from './ui';

export type SupportedFileFormat = 'txt' | 'csv';

export interface LoadedFileMeta {
  readonly name: string;
  readonly format: SupportedFileFormat;
  readonly sizeBytes: number;
}

export type FileValidationResult =
  | { readonly ok: true; readonly format: SupportedFileFormat }
  | { readonly ok: false; readonly error: string };

export type FileLoadResult =
  | { readonly ok: true; readonly content: string; readonly meta: LoadedFileMeta }
  | { readonly ok: false; readonly error: string };

export interface CsvComparisonCell {
  readonly originalValue: string;
  readonly sanitizedValue: string;
  readonly detectedEntities: DetectedEntity[];
  readonly redactedEntities: RedactedEntity[];
}

export interface CsvComparisonData {
  readonly headers: string[];
  readonly rows: CsvComparisonCell[][];
}

export interface CsvSanitizationSuccess {
  readonly ok: true;
  readonly sanitizedCsv: string;
  readonly mode: RedactionMode;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly countsByCategory: CategoryCounts;
  readonly totalDetected: number;
  readonly totalSanitized: number;
  readonly entities: RedactedEntity[];
  readonly comparison: CsvComparisonData;
}

export interface CsvSanitizationFailure {
  readonly ok: false;
  readonly error: string;
}

export type CsvSanitizationResult =
  | CsvSanitizationSuccess
  | CsvSanitizationFailure;
