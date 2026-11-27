import { describe, expect, it } from 'vitest';
import {
  applyPartialMask,
  createPseudonymSession,
  detectPii,
  sanitizeText,
} from './index';

function buildVerhoeffFixture(baseElevenDigits: string): string {
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

describe('PII engine edge-case and regression suite', () => {
  describe('boundary, punctuation, CRLF, and Unicode prose', () => {
    it('strips surrounding punctuation and sentence-ending periods cleanly', () => {
      const text =
        '(user@example.com), "user2@example.com"; [192.168.1.10] <user+tag@sub.domain.co.in> ip=2001:db8::1. pan:ABCPE1234F, tail 10.0.0.1.';

      const detection = detectPii(text);
      expect(detection.entities.map((e) => e.value)).toEqual([
        'user@example.com',
        'user2@example.com',
        '192.168.1.10',
        'user+tag@sub.domain.co.in',
        '2001:db8::1',
        'ABCPE1234F',
        '10.0.0.1',
      ]);

      for (const entity of detection.entities) {
        expect(text.slice(entity.start, entity.end)).toBe(entity.value);
      }
    });

    it('preserves entities at index 0, text.length, CRLF line breaks, and Unicode prose verbatim', () => {
      const text =
        'alice@example.com\r\nJosé Álvarez — “urgent” update: PAN ABCPE1234F\r\nEnd: 192.168.1.1';
      const { detection, redaction } = sanitizeText(text, { mode: 'full' });

      expect(detection.entities[0]?.start).toBe(0);
      expect(detection.entities[2]?.end).toBe(text.length);
      expect(redaction.sanitizedText).toBe(
        '[REDACTED]\r\nJosé Álvarez — “urgent” update: PAN [REDACTED]\r\nEnd: [REDACTED]',
      );
    });
  });

  describe('false-positive resistance regressions', () => {
    it('does not falsely match versions, malformed IPs, timestamps, dates, invalid PANs, or bad checksums', () => {
      const validAadhaar = buildVerhoeffFixture('23456789012');
      const invalidChecksumAadhaar = `${validAadhaar.slice(0, 11)}${(Number(validAadhaar[11]) + 1) % 10}`;

      const noisy = [
        'Versions: v1.2.3.4, v10.0.0.1, 1.2.3.4.5, ratio 3.14.159.',
        'Bad IPs: 256.10.20.30, 192.168.01.1, time 09:45:12 and 23:59:59.',
        'Dates: 2026-11-27 and 27/11/2026.',
        'Order IDs: 4111-1111-1111-1112 and 5412345678901239.',
        `Bad IDs: ${invalidChecksumAadhaar}, 034567890123, 134567890123, 2345678901234.`,
        'Bad PANs: ABCDZ1234F and REFABCPE1234F99.',
      ].join('\n');

      const result = detectPii(noisy);
      expect(result.entities).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('overlap, partial masking, and stateless isolation edge cases', () => {
    it('resolves numeric-prefixed emails to a single email without phone/aadhaar overlap', () => {
      const text =
        'Accounts: 9876543210@example.com and 234567890123@example.org';
      const result = detectPii(text);

      expect(result.totalCount).toBe(2);
      expect(result.countsByCategory.email).toBe(2);
      expect(result.countsByCategory.phone).toBe(0);
      expect(result.countsByCategory.aadhaar).toBe(0);
    });

    it('handles single-char email local parts and compressed IPv6 partial masking', () => {
      expect(applyPartialMask('email', 'a@example.com')).toBe('*@example.com');
      expect(applyPartialMask('ip', '::1')).toBe('::XXXX');
      expect(applyPartialMask('ip', '2001:db8::1')).toBe('2001:XXXX::XXXX');
      expect(applyPartialMask('ip', 'fe80::1ff:fe23:4567:890a')).toBe(
        'fe80::XXXX:XXXX:XXXX:XXXX',
      );
    });

    it('normalizes equivalent formatting for consistent pseudonymization and isolates independent runs', () => {
      const aadhaarDigits = buildVerhoeffFixture('34567890123');
      const aadhaarHyphen = `${aadhaarDigits.slice(0, 4)}-${aadhaarDigits.slice(4, 8)}-${aadhaarDigits.slice(8, 12)}`;

      const text = [
        'Email: Alice@Example.com and alice@example.com',
        'Card: 4111-1111-1111-1111 and 4111 1111 1111 1111',
        `Aadhaar: ${aadhaarDigits} and ${aadhaarHyphen}`,
      ].join('\n');

      const session = createPseudonymSession();
      const first = sanitizeText(text, {
        mode: 'pseudonymize',
        pseudonymSession: session,
      });

      expect(first.redaction.sanitizedText).toBe(
        [
          'Email: [EMAIL_001] and [EMAIL_001]',
          'Card: [CARD_001] and [CARD_001]',
          'Aadhaar: [AADHAAR_001] and [AADHAAR_001]',
        ].join('\n'),
      );

      // Independent runs without a shared session must not carry counters across calls.
      const isolatedA = sanitizeText('one@example.com', {
        mode: 'pseudonymize',
      });
      const isolatedB = sanitizeText('two@example.com', {
        mode: 'pseudonymize',
      });
      expect(isolatedA.redaction.sanitizedText).toBe('[EMAIL_001]');
      expect(isolatedB.redaction.sanitizedText).toBe('[EMAIL_001]');
    });
  });
});
