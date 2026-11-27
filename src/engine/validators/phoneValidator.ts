import type { ValidationResult } from '../../types/detection';

const METHOD = 'phone-structure';

function hasBalancedParentheses(value: string): boolean {
  let depth = 0;
  let insideGroup = false;
  let groupHasDigits = false;

  for (const char of value) {
    if (char === '(') {
      if (depth > 0) {
        return false;
      }
      depth += 1;
      insideGroup = true;
      groupHasDigits = false;
    } else if (char === ')') {
      if (depth === 0 || !groupHasDigits) {
        return false;
      }
      depth -= 1;
      insideGroup = false;
    } else if (insideGroup && /\d/.test(char)) {
      groupHasDigits = true;
    }
  }

  return depth === 0;
}

function isDateLike(value: string): boolean {
  return (
    /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(value) ||
    /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(value)
  );
}

/**
 * Validates structural plausibility of domestic and international phone numbers.
 * Note: Checks structural formatting only and does not verify active carrier allocation.
 */
export function validatePhone(value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed !== value) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Empty or whitespace-padded value.',
    };
  }

  if (!/^[+()0-9 .-]+$/.test(value)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Contains disallowed characters.',
    };
  }

  const plusCount = (value.match(/\+/g) ?? []).length;
  if (
    plusCount > 1 ||
    (plusCount === 1 && !value.startsWith('+') && !value.startsWith('(+'))
  ) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Invalid plus sign placement.',
    };
  }

  if (!hasBalancedParentheses(value)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Unbalanced or empty parentheses.',
    };
  }

  if (isDateLike(value)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Matches date pattern.',
    };
  }

  const digits = value.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(digits)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Trivial repeated-digit sequence.',
    };
  }

  const hasInternationalPrefix =
    value.startsWith('+') || value.startsWith('(+') || value.startsWith('00');

  if (hasInternationalPrefix) {
    const normalized = value.startsWith('00') ? digits.slice(2) : digits;
    if (!/^[1-9]/.test(normalized)) {
      return {
        isValid: false,
        method: METHOD,
        reason: 'International country code must start with 1-9.',
      };
    }

    if (normalized.startsWith('91')) {
      const subscriber = normalized.slice(2);
      if (!/^[6-9]\d{9}$/.test(subscriber)) {
        return {
          isValid: false,
          method: METHOD,
          reason: 'Indian +91 subscriber number must be 10 digits starting with 6-9.',
        };
      }
      return { isValid: true, method: METHOD };
    }

    if (normalized.length < 10 || normalized.length > 15) {
      return {
        isValid: false,
        method: METHOD,
        reason: 'International phone number must contain 10 to 15 digits.',
      };
    }

    return { isValid: true, method: METHOD };
  }

  // Domestic 11-digit Indian number with trunk prefix 0.
  if (digits.length === 11 && digits.startsWith('0')) {
    if (!/^0[6-9]\d{9}$/.test(digits)) {
      return {
        isValid: false,
        method: METHOD,
        reason: 'Trunk-prefixed Indian mobile number must start with 0 followed by 6-9.',
      };
    }
    return { isValid: true, method: METHOD };
  }

  if (digits.length !== 10) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Domestic phone number must contain 10 digits.',
    };
  }

  // Accept Indian 10-digit mobile numbers (6-9) or formatted NANP 10-digit numbers.
  if (/^[6-9]\d{9}$/.test(digits)) {
    return { isValid: true, method: METHOD };
  }

  const isFormatted = /[-.() ]/.test(value);
  if (isFormatted && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    return { isValid: true, method: METHOD };
  }

  return {
    isValid: false,
    method: METHOD,
    reason: 'Does not match valid domestic phone structure.',
  };
}
