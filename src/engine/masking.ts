import type { PiiCategory } from '../types/ui';

const FULL_MASK_TOKEN = '[REDACTED]';

function maskDigitsExceptTrailing(
  value: string,
  visibleTrailingDigits: number,
  maskChar = 'X',
): string {
  const totalDigits = (value.match(/\d/g) ?? []).length;
  const digitsToMask = Math.max(0, totalDigits - visibleTrailingDigits);

  let maskedSoFar = 0;
  let result = '';

  for (const char of value) {
    if (/\d/.test(char)) {
      if (maskedSoFar < digitsToMask) {
        result += maskChar;
        maskedSoFar += 1;
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

function maskEmailPartial(value: string): string {
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) {
    return FULL_MASK_TOKEN;
  }

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1);

  if (localPart.length === 1) {
    return `*@${domainPart}`;
  }

  return `${localPart[0] ?? '*'}***@${domainPart}`;
}

function maskPanPartial(value: string): string {
  if (value.length < 4) {
    return 'X'.repeat(value.length);
  }

  const prefix = value.slice(0, 2);
  const suffix = value.slice(-2);
  const middleLength = value.length - 4;
  return `${prefix}${'X'.repeat(middleLength)}${suffix}`;
}

function maskIpPartial(value: string): string {
  if (!value.includes(':')) {
    const octets = value.split('.');
    const firstOctet = octets[0] ?? 'XXX';
    return `${firstOctet}.XXX.XXX.XXX`;
  }

  if (value.startsWith('::')) {
    const rest = value.slice(2);
    if (rest.length === 0) {
      return '::';
    }
    const maskedGroups = rest
      .split(':')
      .map((group) => (group.length > 0 ? 'XXXX' : ''));
    return `::${maskedGroups.join(':')}`;
  }

  const doubleColonIndex = value.indexOf('::');
  if (doubleColonIndex !== -1) {
    const left = value.slice(0, doubleColonIndex);
    const right = value.slice(doubleColonIndex + 2);

    const leftGroups = left.split(':');
    const maskedLeft = leftGroups
      .map((group, index) => (index === 0 ? group : 'XXXX'))
      .join(':');

    if (right.length === 0) {
      return `${maskedLeft}::`;
    }

    const maskedRight = right
      .split(':')
      .map((group) => (group.length > 0 ? 'XXXX' : ''))
      .join(':');
    return `${maskedLeft}::${maskedRight}`;
  }

  const groups = value.split(':');
  return groups
    .map((group, index) => (index === 0 ? group : 'XXXX'))
    .join(':');
}

/**
 * Mode 1: Full Masking.
 * Always replaces any detected entity with the uniform "[REDACTED]" token.
 */
export function applyFullMask(): string {
  return FULL_MASK_TOKEN;
}

/**
 * Mode 2: Partial Masking.
 * Applies deterministic, category-specific masking that hides sensitive
 * characters while preserving recognizable structural cues.
 */
export function applyPartialMask(category: PiiCategory, value: string): string {
  switch (category) {
    case 'email':
      return maskEmailPartial(value);
    case 'credit_card':
      return maskDigitsExceptTrailing(value, 4, 'X');
    case 'aadhaar':
      return maskDigitsExceptTrailing(value, 4, 'X');
    case 'pan':
      return maskPanPartial(value);
    case 'phone':
      return maskDigitsExceptTrailing(value, 4, 'X');
    case 'ip':
      return maskIpPartial(value);
  }
}
