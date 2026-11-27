import type { ValidationResult } from '../../types/detection';

const IPV4_METHOD = 'ipv4-parse';
const IPV6_METHOD = 'ipv6-parse';

function isValidIpv4Octet(octet: string): boolean {
  if (!/^(?:0|[1-9]\d{0,2})$/.test(octet)) {
    return false;
  }

  const numeric = Number(octet);
  return numeric >= 0 && numeric <= 255;
}

/**
 * Strictly parses an IPv4 address (4 decimal octets 0-255, no leading zeros).
 */
export function validateIpv4(value: string): ValidationResult {
  const octets = value.split('.');
  if (octets.length !== 4 || !octets.every(isValidIpv4Octet)) {
    return {
      isValid: false,
      method: IPV4_METHOD,
      reason: 'Must have 4 octets in range 0-255 without leading zeros.',
    };
  }

  return {
    isValid: true,
    method: IPV4_METHOD,
  };
}

function countIpv6SideGroups(side: string, allowTrailingIpv4: boolean): number | null {
  if (side.length === 0) {
    return 0;
  }

  if (side.startsWith(':') || side.endsWith(':')) {
    return null;
  }

  const segments = side.split(':');
  let groupCount = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined || segment.length === 0) {
      return null;
    }

    const isLast = index === segments.length - 1;
    if (isLast && allowTrailingIpv4 && segment.includes('.')) {
      if (!validateIpv4(segment).isValid) {
        return null;
      }
      groupCount += 2;
      continue;
    }

    if (!/^[0-9A-Fa-f]{1,4}$/.test(segment)) {
      return null;
    }
    groupCount += 1;
  }

  return groupCount;
}

/**
 * Strictly parses an RFC 4291 IPv6 address (8 uncompressed groups or :: compressed).
 */
export function validateIpv6(value: string): ValidationResult {
  if (value.length === 0 || value.includes(':::')) {
    return {
      isValid: false,
      method: IPV6_METHOD,
      reason: 'Invalid IPv6 colon syntax.',
    };
  }

  const parts = value.split('::');
  if (parts.length > 2) {
    return {
      isValid: false,
      method: IPV6_METHOD,
      reason: 'IPv6 address may contain at most one :: compression marker.',
    };
  }

  if (parts.length === 1) {
    const groups = countIpv6SideGroups(value, true);
    if (groups !== 8) {
      return {
        isValid: false,
        method: IPV6_METHOD,
        reason: 'Uncompressed IPv6 address must contain 8 groups.',
      };
    }

    return {
      isValid: true,
      method: IPV6_METHOD,
    };
  }

  const left = parts[0] ?? '';
  const right = parts[1] ?? '';
  const leftGroups = countIpv6SideGroups(left, false);
  const rightGroups = countIpv6SideGroups(right, true);

  if (leftGroups === null || rightGroups === null) {
    return {
      isValid: false,
      method: IPV6_METHOD,
      reason: 'Invalid hex group or trailing colon in compressed IPv6 address.',
    };
  }

  if (leftGroups + rightGroups >= 8) {
    return {
      isValid: false,
      method: IPV6_METHOD,
      reason: 'Compressed IPv6 address must compress at least one zero group.',
    };
  }

  return {
    isValid: true,
    method: IPV6_METHOD,
  };
}

/**
 * Validates either IPv4 or IPv6 addresses.
 */
export function validateIp(value: string): ValidationResult {
  if (value.includes(':')) {
    return validateIpv6(value);
  }
  return validateIpv4(value);
}
