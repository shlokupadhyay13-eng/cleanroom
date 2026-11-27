import type { ValidationResult } from '../../types/detection';

const METHOD = 'pan-format';

const VALID_ENTITY_HOLDER_CODES = new Set([
  'A',
  'B',
  'C',
  'F',
  'G',
  'H',
  'J',
  'L',
  'P',
  'T',
]);

/**
 * Validates Indian PAN format and 4th-character entity holder classification code.
 * Note: This checks structural format only and does not verify registration
 * or issuance with tax authorities.
 */
export function validatePan(value: string): ValidationResult {
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Must match 5 uppercase letters, 4 digits, and 1 uppercase letter.',
    };
  }

  const holderCode = value[3];
  if (!holderCode || !VALID_ENTITY_HOLDER_CODES.has(holderCode)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Invalid 4th-character PAN entity holder code.',
    };
  }

  return {
    isValid: true,
    method: METHOD,
  };
}
