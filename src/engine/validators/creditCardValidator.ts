import type { ValidationResult } from '../../types/detection';

const METHOD = 'luhn-checksum';

/**
 * Validates numeric sequence integrity using the Luhn (Mod-10) algorithm.
 * Note: Luhn validation verifies numeric structure only and does not confirm
 * card activation, issuer status, or ownership.
 */
export function isValidLuhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Validates a payment card candidate by checking allowed separators, length
 * bounds (13-19 digits), non-trivial digit distribution, and Luhn checksum.
 */
export function validateCreditCard(value: string): ValidationResult {
  if (!/^[\d -]+$/.test(value)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Contains characters other than ASCII digits, spaces, or hyphens.',
    };
  }

  const digits = value.replace(/[ -]/g, '');
  if (!/^\d+$/.test(digits) || digits.length < 13 || digits.length > 19) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Card candidate must contain 13 to 19 digits.',
    };
  }

  if (/^(\d)\1+$/.test(digits)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Trivial repeated-digit sequence.',
    };
  }

  if (!isValidLuhn(digits)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Failed Luhn Mod-10 checksum.',
    };
  }

  return {
    isValid: true,
    method: METHOD,
  };
}
