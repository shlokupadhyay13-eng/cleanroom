import type { RawCandidate } from '../types/detection';
import type { PiiCategory } from '../types/ui';

const CATEGORY_PRIORITY: Record<PiiCategory, number> = {
  email: 0,
  ip: 1,
  pan: 2,
  credit_card: 3,
  aadhaar: 4,
  phone: 5,
};

function compareByPrecedence(a: RawCandidate, b: RawCandidate): number {
  const lengthDiff = b.end - b.start - (a.end - a.start);
  if (lengthDiff !== 0) {
    return lengthDiff;
  }

  const priorityDiff =
    CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return a.start - b.start;
}

function intervalsOverlap(a: RawCandidate, b: RawCandidate): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Resolves overlapping or duplicate PII candidates deterministically.
 *
 * Precedence rules:
 * 1. Longer character span wins.
 * 2. Category specificity tie-breaker: email > ip > pan > credit_card > aadhaar > phone.
 * 3. Earlier start offset wins if length and category priority are equal.
 */
export function resolveOverlaps<T extends RawCandidate>(
  candidates: readonly T[],
): T[] {
  if (candidates.length === 0) {
    return [];
  }

  const prioritized = [...candidates].sort(compareByPrecedence);
  const accepted: T[] = [];

  for (const candidate of prioritized) {
    const hasOverlap = accepted.some((existing) =>
      intervalsOverlap(candidate, existing),
    );
    if (!hasOverlap) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}
