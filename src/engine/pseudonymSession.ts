import type { PseudonymSession } from '../types/redaction';
import { createEmptyCategoryCounts, type CategoryCounts, type PiiCategory } from '../types/ui';

const CATEGORY_TOKEN_PREFIX: Record<PiiCategory, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  ip: 'IP',
  pan: 'PAN',
  aadhaar: 'AADHAAR',
  credit_card: 'CARD',
};

function normalizeValueForCategory(
  category: PiiCategory,
  rawValue: string,
): string {
  const trimmed = rawValue.trim();

  switch (category) {
    case 'email':
    case 'ip':
      return trimmed.toLowerCase();
    case 'pan':
      return trimmed.toUpperCase();
    case 'aadhaar':
    case 'credit_card':
      return trimmed.replace(/\D/g, '');
    case 'phone':
      return trimmed.replace(/[\s().-]/g, '');
  }
}

/**
 * Creates an in-memory, session-scoped pseudonymization store.
 * Raw PII values remain strictly encapsulated inside closure state and are
 * never exposed in returned metadata.
 */
export function createPseudonymSession(): PseudonymSession {
  const mappings = new Map<string, string>();
  let counters: CategoryCounts = createEmptyCategoryCounts();

  return {
    getOrCreatePlaceholder(category: PiiCategory, rawValue: string): string {
      const normalized = normalizeValueForCategory(category, rawValue);
      const mapKey = `${category}:${normalized}`;

      const existing = mappings.get(mapKey);
      if (existing !== undefined) {
        return existing;
      }

      const nextCount = counters[category] + 1;
      counters[category] = nextCount;
      const padded = String(nextCount).padStart(3, '0');
      const placeholder = `[${CATEGORY_TOKEN_PREFIX[category]}_${padded}]`;

      mappings.set(mapKey, placeholder);
      return placeholder;
    },

    getEntryCount(): number {
      return mappings.size;
    },

    clear(): void {
      mappings.clear();
      counters = createEmptyCategoryCounts();
    },
  };
}
