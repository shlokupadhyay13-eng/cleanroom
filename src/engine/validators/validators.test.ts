import { describe, expect, it } from 'vitest';
import {
  computeVerhoeffCheckDigit,
  isValidLuhn,
  isValidVerhoeff,
  validateAadhaar,
  validateCandidate,
  validateCreditCard,
  validateEmail,
  validateIp,
  validateIpv4,
  validateIpv6,
  validatePan,
  validatePhone,
} from './index';

// Test-only helper to generate mathematically Verhoeff-valid 12-digit synthetic sequences.
function appendVerhoeffCheckDigit(baseDigits: string): string {
  const d: readonly (readonly number[])[] = [
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
  const p: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  let c = 0;
  for (let i = 0; i < baseDigits.length; i += 1) {
    const digit = baseDigits.charCodeAt(baseDigits.length - 1 - i) - 48;
    const permuted = p[(i + 1) % 8]?.[digit] ?? 0;
    c = d[c]?.[permuted] ?? 0;
  }

  return `${baseDigits}${inv[c] ?? 0}`;
}

describe('validators', () => {
  describe('credit card and Luhn validator', () => {
    it('accepts valid Luhn sequences across supported lengths and separators', () => {
      const validCards = [
        '4111 1111 1111 1111',
        '4532-0151-1283-0366',
        '5412345678901232',
        '3782-822463-10005',
        '4000000000006',
      ];

      for (const card of validCards) {
        const result = validateCreditCard(card);
        expect(result.isValid).toBe(true);
        expect(result.method).toBe('luhn-checksum');
      }
      expect(isValidLuhn('4111111111111111')).toBe(true);
    });

    it('rejects off-by-one, transposed, wrong-length, and all-zero sequences', () => {
      const invalidCards = [
        '4111 1111 1111 1112',
        '4532-0151-1283-0636',
        '400000000006',
        '41111111111111111112',
        '0000 0000 0000 0000',
        '4111_1111_1111_1111',
      ];

      for (const card of invalidCards) {
        const result = validateCreditCard(card);
        expect(result.isValid).toBe(false);
        expect(result.method).toBe('luhn-checksum');
      }
      expect(isValidLuhn('4111111111111112')).toBe(false);
    });
  });

  describe('PAN validator', () => {
    it('accepts valid PAN structures across all official entity holder codes', () => {
      const codes = ['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'];
      for (const code of codes) {
        const pan = `ABC${code}E1234F`;
        const result = validatePan(pan);
        expect(result.isValid).toBe(true);
        expect(result.method).toBe('pan-format');
      }
    });

    it('rejects invalid 4th-character codes, lowercase, whitespace, and wrong lengths', () => {
      const invalidPans = [
        'ABCZE1234F',
        'ABCXE1234F',
        'abcpe1234f',
        ' ABCPE1234F',
        'ABCPE12345',
        'ABCPE123F',
        'ABCPE1234FF',
      ];

      for (const pan of invalidPans) {
        const result = validatePan(pan);
        expect(result.isValid).toBe(false);
        expect(result.method).toBe('pan-format');
      }
    });
  });

  describe('Aadhaar and Verhoeff validator', () => {
    it('accepts Verhoeff-valid 12-digit numbers in contiguous, space, and hyphen formats', () => {
      const contiguous = appendVerhoeffCheckDigit('23456789012');
      const secondBase = appendVerhoeffCheckDigit('54321987654');
      const thirdBase = appendVerhoeffCheckDigit('98765432109');

      const spaceGrouped = `${secondBase.slice(0, 4)} ${secondBase.slice(4, 8)} ${secondBase.slice(8, 12)}`;
      const hyphenGrouped = `${thirdBase.slice(0, 4)}-${thirdBase.slice(4, 8)}-${thirdBase.slice(8, 12)}`;

      for (const value of [contiguous, spaceGrouped, hyphenGrouped]) {
        const result = validateAadhaar(value);
        expect(result.isValid).toBe(true);
        expect(result.method).toBe('verhoeff-checksum');
      }

      expect(isValidVerhoeff(contiguous)).toBe(true);
    });

    it('computes canonical Verhoeff check digits and rejects malformed base strings', () => {
      const generated = `23456789012${computeVerhoeffCheckDigit('23456789012')}`;
      expect(isValidVerhoeff(generated)).toBe(true);
      expect(() => computeVerhoeffCheckDigit('')).toThrow();
      expect(() => computeVerhoeffCheckDigit('abc')).toThrow();
    });

    it('rejects single-digit corruption, adjacent transposition, leading 0/1, and mixed separators', () => {
      const valid = appendVerhoeffCheckDigit('23456789012');
      const lastDigit = Number(valid[11]);
      const corruptedLast = `${valid.slice(0, 11)}${(lastDigit + 1) % 10}`;
      const transposed = `${valid.slice(0, 4)}${valid[5]}${valid[4]}${valid.slice(6)}`;

      const leadingZero = appendVerhoeffCheckDigit('03456789012');
      const leadingOne = appendVerhoeffCheckDigit('13456789012');
      const mixedSep = `${valid.slice(0, 4)} ${valid.slice(4, 8)}-${valid.slice(8, 12)}`;

      for (const candidate of [
        corruptedLast,
        transposed,
        leadingZero,
        leadingOne,
        mixedSep,
        '222222222222',
        '23456789012',
      ]) {
        const result = validateAadhaar(candidate);
        expect(result.isValid).toBe(false);
        expect(result.method).toBe('verhoeff-checksum');
      }
    });
  });

  describe('phone validator', () => {
    it('accepts valid Indian and international phone formats', () => {
      const validPhones = [
        '9876543210',
        '09876543210',
        '+91 98765 43210',
        '0091-98765-43210',
        '+1 (415) 555-0199',
        '415-555-0144',
        '(415) 555-0188',
        '+44 20 7946 0958',
      ];

      for (const phone of validPhones) {
        const result = validatePhone(phone);
        expect(result.isValid).toBe(true);
        expect(result.method).toBe('phone-structure');
      }
    });

    it('rejects dates, repeated digits, invalid lengths, unbalanced parens, and bad Indian prefixes', () => {
      const invalidPhones = [
        '2026-11-27',
        '27/11/2026',
        '9999999999',
        '0000000000',
        '987654321',
        '+1 234 567 8901 23456',
        '(415 555-0199',
        '+91 1234567890',
        '1234567890',
      ];

      for (const phone of invalidPhones) {
        const result = validatePhone(phone);
        expect(result.isValid).toBe(false);
        expect(result.method).toBe('phone-structure');
      }
    });
  });

  describe('IPv4 and IPv6 validators', () => {
    it('accepts valid IPv4 addresses and rejects out-of-range or leading-zero octets', () => {
      for (const ip of ['0.0.0.0', '192.168.1.1', '255.255.255.255']) {
        expect(validateIpv4(ip)).toEqual({ isValid: true, method: 'ipv4-parse' });
        expect(validateIp(ip).isValid).toBe(true);
      }

      for (const bad of ['256.0.0.1', '192.168.01.1', '1.2.3', '1.2.3.4.5']) {
        expect(validateIpv4(bad).isValid).toBe(false);
        expect(validateIp(bad).isValid).toBe(false);
      }
    });

    it('accepts valid IPv6 addresses and rejects malformed colon/hex structures', () => {
      const validIpv6 = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '::1',
        '2001:db8::1',
        'fe80::1ff:fe23:4567:890a',
      ];

      for (const ip of validIpv6) {
        expect(validateIpv6(ip)).toEqual({ isValid: true, method: 'ipv6-parse' });
        expect(validateIp(ip).isValid).toBe(true);
      }

      const invalidIpv6 = [
        '2001::db8::1',
        '2001:::1',
        '1:2:3:4:5:6:7:8:9',
        '2001:0db85::1',
        '2001:db8g::1',
        '2001:db8::1:',
        ':1:2:3:4:5:6:7',
        '12:34:56',
      ];

      for (const bad of invalidIpv6) {
        expect(validateIpv6(bad).isValid).toBe(false);
        expect(validateIp(bad).isValid).toBe(false);
      }
    });
  });

  describe('email validator and unified dispatcher', () => {
    it('accepts valid emails and rejects structurally invalid emails', () => {
      for (const email of [
        'alice@example.com',
        'alice.smith+tag@sub.example.co.in',
      ]) {
        expect(validateEmail(email)).toEqual({
          isValid: true,
          method: 'email-format',
        });
        expect(validateCandidate('email', email).isValid).toBe(true);
      }

      const invalidEmails = [
        'a..b@example.com',
        '.alice@example.com',
        'alice.@example.com',
        'user@localhost',
        'user@example.c',
        'user@-example.com',
        'a@b@example.com',
      ];

      for (const email of invalidEmails) {
        expect(validateEmail(email).isValid).toBe(false);
        expect(validateCandidate('email', email).isValid).toBe(false);
      }
    });
  });
});
