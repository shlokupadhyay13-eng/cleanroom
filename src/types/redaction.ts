import type { CategoryCounts, PiiCategory, RedactionMode } from './ui';

export interface RedactedEntity {
  readonly id: string;
  readonly category: PiiCategory;
  readonly originalStart: number;
  readonly originalEnd: number;
  readonly sanitizedStart: number;
  readonly sanitizedEnd: number;
  readonly replacement: string;
  readonly validationMethod: string;
}

export interface RedactionResult {
  readonly sanitizedText: string;
  readonly mode: RedactionMode;
  readonly entities: RedactedEntity[];
  readonly countsByCategory: CategoryCounts;
  readonly totalDetected: number;
  readonly totalSanitized: number;
}

export interface PseudonymSession {
  getOrCreatePlaceholder(category: PiiCategory, rawValue: string): string;
  getEntryCount(): number;
  clear(): void;
}

export interface RedactionOptions {
  readonly mode: RedactionMode;
  readonly pseudonymSession?: PseudonymSession;
  readonly enabledCategories?: ReadonlySet<PiiCategory>;
}
