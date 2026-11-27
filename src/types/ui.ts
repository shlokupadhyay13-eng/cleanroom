export type RedactionMode = 'full' | 'partial' | 'pseudonymize';

export type PiiCategory =
  | 'email'
  | 'phone'
  | 'ip'
  | 'pan'
  | 'aadhaar'
  | 'credit_card';

export type ProcessingStatus = 'idle' | 'processing' | 'ready' | 'error';

export type CategoryCounts = Record<PiiCategory, number>;

export interface RedactionModeOption {
  readonly id: RedactionMode;
  readonly label: string;
  readonly description: string;
}

export interface PiiCategoryOption {
  readonly id: PiiCategory;
  readonly label: string;
}

export const REDACTION_MODES: readonly RedactionModeOption[] = [
  {
    id: 'full',
    label: 'Full Masking',
    description: 'Replaces detected identifiers with category placeholders.',
  },
  {
    id: 'partial',
    label: 'Partial Masking',
    description: 'Retains minimal non-sensitive characters for verification.',
  },
  {
    id: 'pseudonymize',
    label: 'Consistent Pseudonymization',
    description: 'Maps repeated identifiers to stable session tokens.',
  },
] as const;

export const PII_CATEGORIES: readonly PiiCategoryOption[] = [
  { id: 'email', label: 'Email Addresses' },
  { id: 'phone', label: 'Phone Numbers' },
  { id: 'ip', label: 'IP Addresses' },
  { id: 'pan', label: 'PAN Numbers' },
  { id: 'aadhaar', label: 'Aadhaar Numbers' },
  { id: 'credit_card', label: 'Credit Cards' },
] as const;

export function createEmptyCategoryCounts(): CategoryCounts {
  return {
    email: 0,
    phone: 0,
    ip: 0,
    pan: 0,
    aadhaar: 0,
    credit_card: 0,
  };
}
