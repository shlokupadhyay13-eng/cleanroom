import type { ValidationResult } from '../../types/detection';

const METHOD = 'email-format';

/**
 * Validates email structural format (local-part, single @, domain labels, and TLD).
 * Note: Format validation does not verify mailbox existence or deliverability.
 */
export function validateEmail(value: string): ValidationResult {
  if (value.length === 0 || value !== value.trim()) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Empty or whitespace-padded email address.',
    };
  }

  const parts = value.split('@');
  if (parts.length !== 2) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Email address must contain exactly one @ separator.',
    };
  }

  const localPart = parts[0] ?? '';
  const domainPart = parts[1] ?? '';

  if (
    localPart.length < 1 ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !/^[A-Za-z0-9._%+-]+$/.test(localPart)
  ) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Invalid email local-part structure.',
    };
  }

  if (domainPart.length < 4 || domainPart.length > 253 || !domainPart.includes('.')) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Invalid email domain length or missing TLD separator.',
    };
  }

  const labels = domainPart.split('.');
  if (labels.length < 2) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Domain must include at least two labels.',
    };
  }

  const labelPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  if (!labels.every((label) => label.length >= 1 && label.length <= 63 && labelPattern.test(label))) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Invalid domain label formatting.',
    };
  }

  const tld = labels[labels.length - 1] ?? '';
  if (!/^[A-Za-z]{2,}$/.test(tld)) {
    return {
      isValid: false,
      method: METHOD,
      reason: 'Top-level domain must consist of at least two alphabetic characters.',
    };
  }

  return {
    isValid: true,
    method: METHOD,
  };
}
