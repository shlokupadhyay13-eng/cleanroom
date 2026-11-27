import type { CategoryCounts, PiiCategory } from './ui';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly method: string;
  readonly reason?: string;
}

export interface DetectedEntity {
  readonly id: string;
  readonly category: PiiCategory;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly validationMethod: string;
}

export interface DetectionResult {
  readonly entities: DetectedEntity[];
  readonly countsByCategory: CategoryCounts;
  readonly totalCount: number;
}

export interface RawCandidate {
  readonly category: PiiCategory;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface DetectorRule {
  readonly category: PiiCategory;
  detect(text: string): RawCandidate[];
}
