import { describe, expect, it } from 'vitest';
import { createEmptyCategoryCounts } from '../types/ui';
import { detectPii } from './detectPii';

function buildVerhoeffAadhaar(baseElevenDigits: string): string {
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
  for (let i = 0; i < baseElevenDigits.length; i += 1) {
    const digit = baseElevenDigits.charCodeAt(baseElevenDigits.length - 1 - i) - 48;
    const permuted = p[(i + 1) % 8]?.[digit] ?? 0;
    c = d[c]?.[permuted] ?? 0;
  }

  return `${baseElevenDigits}${inv[c] ?? 0}`;
}

describe('detectPii', () => {
  describe('no-match and clean documents', () => {
    it('returns empty results for empty and whitespace-only strings', () => {
      for (const input of ['', '   ', '\n\t\r\n']) {
        const result = detectPii(input);
        expect(result.entities).toEqual([]);
        expect(result.countsByCategory).toEqual(createEmptyCategoryCounts());
        expect(result.totalCount).toBe(0);
      }
    });

    it('avoids false positives on clean prose, dates, times, versions, and short IDs', () => {
      const cleanText = [
        'Release v2.4.1.0 deployed on 2026-11-27 at 14:35:20 UTC.',
        'Meeting date 11/27/2026 reference INV-2026-0042 order 1234567890.',
        'Build 1.2.3.4.5 completed in 450ms for host user@localhost.',
      ].join('\n');

      const result = detectPii(cleanText);
      expect(result.entities).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('email detection', () => {
    it('detects standard and tagged email addresses without trailing punctuation', () => {
      const text =
        'Reach alice.smith+support@sub.example.co.in, or "bob_99@company.org".';
      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        'alice.smith+support@sub.example.co.in',
        'bob_99@company.org',
      ]);
      expect(result.entities.every((e) => e.validationMethod === 'email-format')).toBe(true);
      expect(result.countsByCategory.email).toBe(2);
    });

    it('rejects malformed email patterns', () => {
      const malformed =
        'Bad: a..b@example.com, .alice@example.com, alice.@example.com, user@localhost, user@example.c';
      const result = detectPii(malformed);

      expect(result.countsByCategory.email).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('IP address detection', () => {
    it('detects valid IPv4 and IPv6 addresses', () => {
      const text =
        'Hosts: 192.168.1.1, 10.0.0.255, 2001:0db8:85a3:0000:0000:8a2e:0370:7334, fe80::1, and ::1.';
      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        '192.168.1.1',
        '10.0.0.255',
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        'fe80::1',
        '::1',
      ]);
      expect(result.countsByCategory.ip).toBe(5);
    });

    it('rejects out-of-range octets, leading-zero IPv4, versions, and timestamps', () => {
      const text =
        'Invalid: 999.10.20.30, 192.168.01.1, 192.168.1.256, 1.2.3.4.5, v1.2.3.4, 14:35:20, 00:11:22:33:44:55.';
      const result = detectPii(text);

      expect(result.countsByCategory.ip).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('Indian PAN detection', () => {
    it('detects valid 10-character uppercase PAN numbers', () => {
      const text = 'Primary PAN: ABCPE1234F; secondary (PQRCS9876K).';
      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        'ABCPE1234F',
        'PQRCS9876K',
      ]);
      expect(result.entities.every((e) => e.validationMethod === 'pan-format')).toBe(true);
      expect(result.countsByCategory.pan).toBe(2);
    });

    it('rejects invalid 4th-character entity codes, lowercase, wrong length, or substrings', () => {
      const text =
        'Invalid: ABCZE1234F, PQRSX9876K, abcpe1234f, ABCPE12345, XABCPE1234F, ABCPE1234FX.';
      const result = detectPii(text);

      expect(result.countsByCategory.pan).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('Indian Aadhaar pattern detection', () => {
    it('detects Verhoeff-valid contiguous, space-grouped, and hyphen-grouped 12-digit Aadhaar patterns', () => {
      const first = buildVerhoeffAadhaar('23456789012');
      const secondRaw = buildVerhoeffAadhaar('34567890123');
      const thirdRaw = buildVerhoeffAadhaar('98765432109');
      const secondSpaced = `${secondRaw.slice(0, 4)} ${secondRaw.slice(4, 8)} ${secondRaw.slice(8, 12)}`;
      const thirdHyphen = `${thirdRaw.slice(0, 4)}-${thirdRaw.slice(4, 8)}-${thirdRaw.slice(8, 12)}`;

      const text = `Records: ${first}, ${secondSpaced}, and ${thirdHyphen}.`;
      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        first,
        secondSpaced,
        thirdHyphen,
      ]);
      expect(
        result.entities.every((e) => e.validationMethod === 'verhoeff-checksum'),
      ).toBe(true);
      expect(result.countsByCategory.aadhaar).toBe(3);
    });

    it('rejects non-Verhoeff 12-digit numbers, leading 0/1, mixed separators, and 13+ digit strings', () => {
      const valid = buildVerhoeffAadhaar('23456789012');
      const invalidChecksum = `${valid.slice(0, 11)}${(Number(valid[11]) + 1) % 10}`;
      const text = `Invalid: ${invalidChecksum}, 123456789012, 0345 6789 0123, 2345 6789-0123, 23456789012345678901.`;
      const result = detectPii(text);

      expect(result.countsByCategory.aadhaar).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('credit card validation and detection', () => {
    it('detects Luhn-valid contiguous, space-grouped, and hyphen-grouped card numbers', () => {
      const text =
        'Cards: 4111 1111 1111 1111, 3782-822463-10005, and 5412345678901232.';
      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        '4111 1111 1111 1111',
        '3782-822463-10005',
        '5412345678901232',
      ]);
      expect(
        result.entities.every((e) => e.validationMethod === 'luhn-checksum'),
      ).toBe(true);
      expect(result.countsByCategory.credit_card).toBe(3);
    });

    it('excludes non-Luhn 16-digit order IDs and out-of-range digit sequences', () => {
      const text =
        'Non-cards: 4111 1111 1111 1112, 5412345678901239, 123456789012, 2026-11-27.';
      const result = detectPii(text);

      expect(result.countsByCategory.credit_card).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('phone number detection', () => {
    it('detects Indian and international phone formats without swallowing wrappers', () => {
      const text = [
        'Mobile: 9876543210, +91 98765 43210, (+91 91234 56789).',
        'US: +1 (415) 555-0199, 415-555-0144, 415.555.0188.',
        'UK: +44 20 7946 0958.',
      ].join('\n');

      const result = detectPii(text);

      expect(result.entities.map((e) => e.value)).toEqual([
        '9876543210',
        '+91 98765 43210',
        '+91 91234 56789',
        '+1 (415) 555-0199',
        '415-555-0144',
        '415.555.0188',
        '+44 20 7946 0958',
      ]);
      expect(result.countsByCategory.phone).toBe(7);
    });

    it('rejects order IDs, repeated digits, and dates misclassified as phone numbers', () => {
      const text =
        'Order ORD-9876543210 on 2026-11-27, 11/27/2026, and 9999999999.';
      const result = detectPii(text);

      expect(result.countsByCategory.phone).toBe(0);
      expect(result.entities).toEqual([]);
    });
  });

  describe('validation before overlap resolution, offsets, and repeatability', () => {
    it('does not allow an invalid longer sequence to mask a valid overlapping entity', () => {
      const invalidCardStartingWithValidPhone = '4111 1111 1111 1112';
      const result = detectPii(invalidCardStartingWithValidPhone);
      expect(result.entities).toEqual([]);

      const validAadhaarRaw = buildVerhoeffAadhaar('23456789012');
      const validAadhaarSpaced = `${validAadhaarRaw.slice(0, 4)} ${validAadhaarRaw.slice(4, 8)} ${validAadhaarRaw.slice(8, 12)}`;
      const invalidCardContainingValidAadhaar = `${validAadhaarSpaced} 9999`;
      const aadhaarResult = detectPii(invalidCardContainingValidAadhaar);
      expect(aadhaarResult.entities).toHaveLength(1);
      expect(aadhaarResult.entities[0]?.category).toBe('aadhaar');
      expect(aadhaarResult.entities[0]?.value).toBe(validAadhaarSpaced);

      const cardAndEmail =
        'Card 4532 6789 0123 9873 and email 9876543210@example.com';
      const cardResult = detectPii(cardAndEmail);

      expect(cardResult.entities).toHaveLength(2);
      expect(cardResult.entities[0]?.category).toBe('credit_card');
      expect(cardResult.entities[0]?.value).toBe('4532 6789 0123 9873');
      expect(cardResult.entities[1]?.category).toBe('email');
      expect(cardResult.entities[1]?.value).toBe('9876543210@example.com');
    });

    it('preserves exact source offsets across CSV, tabs, quotes, and multi-line text', () => {
      const validAadhaarRaw = buildVerhoeffAadhaar('23456789012');
      const validAadhaar = `${validAadhaarRaw.slice(0, 4)} ${validAadhaarRaw.slice(4, 8)} ${validAadhaarRaw.slice(8, 12)}`;
      const noisyCsv = [
        'name,email,phone,ip,pan,aadhaar,card',
        `"Alice","alice@example.org",+91-98765-43210,192.168.10.5,ABCPE1234F,${validAadhaar},4532-0151-1283-0366`,
        '\t(bob@company.net);\t(415) 555-0199\t[2001:db8::1]',
      ].join('\n');

      const result = detectPii(noisyCsv);

      expect(result.totalCount).toBe(9);
      expect(result.countsByCategory).toEqual({
        email: 2,
        phone: 2,
        ip: 2,
        pan: 1,
        aadhaar: 1,
        credit_card: 1,
      });

      for (let index = 0; index < result.entities.length; index += 1) {
        const entity = result.entities[index];
        if (!entity) {
          continue;
        }

        expect(entity.id).toBe(`entity_${index + 1}`);
        expect(noisyCsv.slice(entity.start, entity.end)).toBe(entity.value);

        const prev = index > 0 ? result.entities[index - 1] : undefined;
        if (prev) {
          expect(prev.end).toBeLessThanOrEqual(entity.start);
        }
      }
    });

    it('produces identical results across repeated calls', () => {
      const sample =
        'User alice@example.com PAN ABCPE1234F IP 10.1.2.3 Phone 9876543210';
      const first = detectPii(sample);
      const second = detectPii(sample);

      expect(first).toEqual(second);
    });

    it('filters detection by enabledCategories when provided', () => {
      const validAadhaarRaw = buildVerhoeffAadhaar('23456789012');
      const sample = `Email alice@example.com Phone 9876543210 IP 10.1.2.3 PAN ABCPE1234F Aadhaar ${validAadhaarRaw} Card 4111-1111-1111-1111`;

      const onlyEmailAndPan = detectPii(sample, {
        enabledCategories: new Set(['email', 'pan']),
      });

      expect(onlyEmailAndPan.totalCount).toBe(2);
      expect(onlyEmailAndPan.entities.map((e) => e.category)).toEqual([
        'email',
        'pan',
      ]);
      expect(onlyEmailAndPan.countsByCategory).toEqual({
        email: 1,
        phone: 0,
        ip: 0,
        pan: 1,
        aadhaar: 0,
        credit_card: 0,
      });

      const disabledAll = detectPii(sample, {
        enabledCategories: new Set(),
      });

      expect(disabledAll.totalCount).toBe(0);
      expect(disabledAll.entities).toEqual([]);
      expect(disabledAll.countsByCategory).toEqual({
        email: 0,
        phone: 0,
        ip: 0,
        pan: 0,
        aadhaar: 0,
        credit_card: 0,
      });
    });
  });
});
