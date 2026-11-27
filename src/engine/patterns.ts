import type { DetectorRule, RawCandidate } from '../types/detection';
import type { PiiCategory } from '../types/ui';

function collectMatches(
  text: string,
  category: PiiCategory,
  createPattern: () => RegExp,
  predicate?: (matchValue: string, text: string, start: number, end: number) => boolean,
): RawCandidate[] {
  const regex = createPattern();
  const candidates: RawCandidate[] = [];

  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const start = match.index;
    if (start === undefined || value.length === 0) {
      continue;
    }

    const end = start + value.length;
    if (predicate && !predicate(value, text, start, end)) {
      continue;
    }

    candidates.push({
      category,
      value,
      start,
      end,
    });
  }

  return candidates;
}

function isPlausibleIpv6(candidate: string): boolean {
  if (candidate.includes(':::')) {
    return false;
  }

  const doubleColonParts = candidate.split('::');
  if (doubleColonParts.length > 2) {
    return false;
  }

  const hexGroupPattern = /^[0-9A-Fa-f]{1,4}$/;

  if (doubleColonParts.length === 1) {
    const groups = candidate.split(':');
    return groups.length === 8 && groups.every((group) => hexGroupPattern.test(group));
  }

  const left = doubleColonParts[0] ?? '';
  const right = doubleColonParts[1] ?? '';

  if (left.startsWith(':') || left.endsWith(':') || right.startsWith(':') || right.endsWith(':')) {
    return false;
  }

  const leftGroups = left.length > 0 ? left.split(':') : [];
  const rightGroups = right.length > 0 ? right.split(':') : [];
  const totalGroups = leftGroups.length + rightGroups.length;

  if (totalGroups === 0 || totalGroups >= 8) {
    return false;
  }

  return (
    leftGroups.every((group) => hexGroupPattern.test(group)) &&
    rightGroups.every((group) => hexGroupPattern.test(group))
  );
}

function isPlausibleCreditCardCandidate(value: string): boolean {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return false;
  }

  if (value.includes('-') || value.includes(' ')) {
    const separator = value.includes('-') ? '-' : ' ';
    const groups = value.split(separator);
    if (groups.length < 3) {
      return false;
    }

    return groups.every((group, index) => {
      if (index === 0) {
        return group.length >= 3 && group.length <= 6;
      }
      if (index === groups.length - 1) {
        return group.length >= 1 && group.length <= 6;
      }
      return group.length >= 3 && group.length <= 6;
    });
  }

  return true;
}

function isPlausiblePhoneCandidate(
  value: string,
  text: string,
  start: number,
  end: number,
): boolean {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return false;
  }

  // Reject candidates immediately adjacent to alphanumeric or hyphen-digit chains.
  const prevChar = start > 0 ? text[start - 1] : undefined;
  const prevPrevChar = start > 1 ? text[start - 2] : undefined;
  if (prevChar === '-' && prevPrevChar !== undefined && /[A-Za-z0-9]/.test(prevPrevChar)) {
    return false;
  }

  const nextChar = end < text.length ? text[end] : undefined;
  const nextNextChar = end + 1 < text.length ? text[end + 1] : undefined;
  if (nextChar === '-' && nextNextChar !== undefined && /\d/.test(nextNextChar)) {
    return false;
  }

  // Reject dot-separated sequences that continue into another numeric segment (e.g. IPv4).
  if (prevChar === '.' && prevPrevChar !== undefined && /\d/.test(prevPrevChar)) {
    return false;
  }
  if (nextChar === '.' && nextNextChar !== undefined && /\d/.test(nextNextChar)) {
    return false;
  }

  return true;
}

export const emailDetector: DetectorRule = {
  category: 'email',
  detect(text: string): RawCandidate[] {
    return collectMatches(
      text,
      'email',
      () =>
        /(?<![A-Za-z0-9._%+-])[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/g,
    );
  },
};

export const ipDetector: DetectorRule = {
  category: 'ip',
  detect(text: string): RawCandidate[] {
    const ipv4 = collectMatches(
      text,
      'ip',
      () =>
        /(?<![A-Za-z0-9.])(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}(?![A-Za-z0-9]|\.[A-Za-z0-9])/g,
    );

    const ipv6 = collectMatches(
      text,
      'ip',
      () =>
        /(?<![A-Za-z0-9:])(?=[0-9A-Fa-f:]*:[0-9A-Fa-f:]*:)[0-9A-Fa-f:]{3,39}(?![A-Za-z0-9:])/g,
      (value) => isPlausibleIpv6(value),
    );

    return [...ipv4, ...ipv6];
  },
};

export const panDetector: DetectorRule = {
  category: 'pan',
  detect(text: string): RawCandidate[] {
    return collectMatches(
      text,
      'pan',
      () => /(?<![A-Za-z0-9])[A-Z]{5}[0-9]{4}[A-Z](?![A-Za-z0-9])/g,
    );
  },
};

export const aadhaarDetector: DetectorRule = {
  category: 'aadhaar',
  detect(text: string): RawCandidate[] {
    // Structural pattern detection only; Verhoeff checksum validation is applied in Phase 4.
    return collectMatches(
      text,
      'aadhaar',
      () =>
        /(?<![A-Za-z0-9])(?<!\d-)(?:[2-9]\d{11}|[2-9]\d{3} \d{4} \d{4}|[2-9]\d{3}-\d{4}-\d{4})(?![A-Za-z0-9])(?!-\d)/g,
    );
  },
};

export const creditCardDetector: DetectorRule = {
  category: 'credit_card',
  detect(text: string): RawCandidate[] {
    // Structural candidate detection only; Luhn checksum filtering is applied in Phase 4.
    const contiguous = collectMatches(
      text,
      'credit_card',
      () => /(?<![A-Za-z0-9])\d{13,19}(?![A-Za-z0-9])/g,
      (value) => isPlausibleCreditCardCandidate(value),
    );

    const spaced = collectMatches(
      text,
      'credit_card',
      () => /(?<![A-Za-z0-9])\d{3,6}(?: \d{1,6}){2,}(?![A-Za-z0-9])/g,
      (value) => isPlausibleCreditCardCandidate(value),
    );

    const hyphenated = collectMatches(
      text,
      'credit_card',
      () => /(?<![A-Za-z0-9-])\d{3,6}(?:-\d{1,6}){2,}(?![A-Za-z0-9-])/g,
      (value) => isPlausibleCreditCardCandidate(value),
    );

    return [...contiguous, ...spaced, ...hyphenated];
  },
};

export const phoneDetector: DetectorRule = {
  category: 'phone',
  detect(text: string): RawCandidate[] {
    const international = collectMatches(
      text,
      'phone',
      () =>
        /(?<![A-Za-z0-9+])(?:\(\+\d{1,3}\)|(?:\+|00)[1-9]\d{0,2})(?:[- .]?(?:\(\d{1,5}\)|\d{1,5})){1,5}(?![A-Za-z0-9])/g,
      isPlausiblePhoneCandidate,
    );

    const indianDomestic = collectMatches(
      text,
      'phone',
      () =>
        /(?<![A-Za-z0-9])(?:0?[6-9]\d{9}|0?[6-9]\d{4}[ -]\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})(?![A-Za-z0-9])/g,
      isPlausiblePhoneCandidate,
    );

    const formattedDomestic = collectMatches(
      text,
      'phone',
      () =>
        /(?<![A-Za-z0-9])(?:\(\d{3}\)[- .]?|\d{3}[-.])\d{3}[-.]\d{4}(?![A-Za-z0-9])/g,
      isPlausiblePhoneCandidate,
    );

    return [...international, ...indianDomestic, ...formattedDomestic];
  },
};

export const DETECTOR_RULES: readonly DetectorRule[] = [
  emailDetector,
  ipDetector,
  panDetector,
  aadhaarDetector,
  creditCardDetector,
  phoneDetector,
] as const;
