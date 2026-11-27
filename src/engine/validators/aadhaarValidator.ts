import type { ValidationResult } from '../../types/detection';

const METHOD = 'verhoeff-checksum';

const VERHOEFF_D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const VERHOEFF_INV: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Computes the trailing Verhoeff dihedral group D5 check digit for a numeric
 * prefix so synthetic test fixtures share the same canonical table as validation.
 */
export function computeVerhoeffCheckDigit(baseDigits: string): string {
  if (!/^\d+$/.test(baseDigits) || baseDigits.length === 0) {
    throw new Error('Verhoeff check-digit input must be a non-empty digit string.');
  }

  let c = 0;
  for (let offset = 0; offset < baseDigits.length; offset += 1) {
    const digit = baseDigits.charCodeAt(baseDigits.length - 1 - offset) - 48;
    const permuted = VERHOEFF_P[(offset + 1) % 8]?.[digit];
    if (permuted === undefined) {
      throw new Error('Unexpected digit out of range while computing Verhoeff check digit.');
    }

    const next = VERHOEFF_D[c]?.[permuted];
    if (next === undefined) {
      throw new Error('Unexpected state while computing Verhoeff check digit.');
    }
    c = next;
  }

  return String(VERHOEFF_INV[c] ?? 0);
}

/**
 * Validates numeric checksum integrity using the Verhoeff dihedral group D5 algorithm.
 * Note: Verhoeff validation verifies structural checksum integrity only and never
 * confirms real identity or UIDAI issuance.
 */
export function isValidVerhoeff(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length === 0) {
    return false;
  }

  let c = 0;
  for (let offset = 0; offset < digits.length; offset += 1) {
    const charIndex = digits.length - 1 - offset;
    const digit = digits.charCodeAt(charIndex) - 48;
    const permRow = VERHOEFF_P[offset % 8];
    const permuted = permRow?.[digit];
    if (permuted === undefined) {
      return false;
    }

    const next = VERHOEFF_D[c]?.[permuted];
    if (next === undefined) {
      return false;
    }
    c = next;
  }

  return VERHOEFF_INV[c] === 0;
}

/**
 * Validates an Indian Aadhaar-shaped 12-digit candidate for consistent grouping,
 * leading-digit range (2-9), non-trivial sequence, and Verhoeff checksum.
 */
export function validateAadhaar(value: string): ValidationResult {
  if (
    !/^(?:[2-9]\d{11}|[2-9]\d{3} \d{4} \d{4}|[2-9]\d{3}-\d{4}-\d{4})$/.test(
      value,
    )
  ) {
    return {
      isValid: false,
      method: METHOD,
      reason:
        'Must be 12 digits starting with 2-9, contiguous or grouped consistently by spaces or hyphens.',
    };
  }

  const digits = value.replace(/[ -]/g, '');
  if (/^(\d)\1+$/.test(digits)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Trivial repeated-digit sequence.',
    };
  }

  if (!isValidVerhoeff(digits)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Failed Verhoeff checksum.',
    };
  }

  return {
    isValid: true,
    method: METHOD,
  };
}
