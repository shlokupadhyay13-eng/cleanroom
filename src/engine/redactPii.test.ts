import { describe, expect, it } from 'vitest';
import { createEmptyCategoryCounts } from '../types/ui';
import {
  applyFullMask,
  applyPartialMask,
  createPseudonymSession,
  detectPii,
  redactDetectedEntities,
  sanitizeText,
} from './index';

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

describe('redaction engine', () => {
  describe('Mode 1: Full Masking', () => {
    it('replaces every detected category with [REDACTED]', () => {
      const aadhaarRaw = buildVerhoeffAadhaar('23456789012');
      const aadhaar = `${aadhaarRaw.slice(0, 4)} ${aadhaarRaw.slice(4, 8)} ${aadhaarRaw.slice(8, 12)}`;
      const source = [
        'Email: john@example.com',
        'Phone: +91 98765 43210',
        'IPv4: 192.168.1.42 | IPv6: 2001:db8::1',
        'PAN: ABCPE1234F',
        `Aadhaar: ${aadhaar}`,
        'Card: 4111-1111-1111-1111',
      ].join('\n');

      const { redaction } = sanitizeText(source, { mode: 'full' });

      expect(applyFullMask()).toBe('[REDACTED]');
      expect(redaction.mode).toBe('full');
      expect(redaction.totalDetected).toBe(7);
      expect(redaction.totalSanitized).toBe(7);
      expect(redaction.entities.every((e) => e.replacement === '[REDACTED]')).toBe(
        true,
      );
      expect(redaction.sanitizedText).toBe(
        [
          'Email: [REDACTED]',
          'Phone: [REDACTED]',
          'IPv4: [REDACTED] | IPv6: [REDACTED]',
          'PAN: [REDACTED]',
          'Aadhaar: [REDACTED]',
          'Card: [REDACTED]',
        ].join('\n'),
      );
    });
  });

  describe('Mode 2: Partial Masking', () => {
    it('applies category-specific partial masking rules across all 6 categories', () => {
      expect(applyPartialMask('email', 'john@example.com')).toBe(
        'j***@example.com',
      );
      expect(applyPartialMask('email', 'a@example.com')).toBe('*@example.com');

      expect(applyPartialMask('credit_card', '4111-1111-1111-1234')).toBe(
        'XXXX-XXXX-XXXX-1234',
      );
      expect(applyPartialMask('credit_card', '5412345678901232')).toBe(
        'XXXXXXXXXXXX1232',
      );

      expect(applyPartialMask('aadhaar', '2345-6789-0123')).toBe(
        'XXXX-XXXX-0123',
      );
      expect(applyPartialMask('aadhaar', '2345 6789 0123')).toBe(
        'XXXX XXXX 0123',
      );
      expect(applyPartialMask('aadhaar', '234567890123')).toBe('XXXXXXXX0123');

      expect(applyPartialMask('pan', 'ABCPE1234F')).toBe('ABXXXXXX4F');

      expect(applyPartialMask('phone', '+91 98765 43210')).toBe(
        '+XX XXXXX X3210',
      );
      expect(applyPartialMask('phone', '(415) 555-0199')).toBe(
        '(XXX) XXX-0199',
      );
      expect(applyPartialMask('phone', '9876543210')).toBe('XXXXXX3210');

      expect(applyPartialMask('ip', '192.168.1.42')).toBe('192.XXX.XXX.XXX');
      expect(applyPartialMask('ip', '::1')).toBe('::XXXX');
      expect(applyPartialMask('ip', '2001:db8::1')).toBe('2001:XXXX::XXXX');
      expect(applyPartialMask('ip', 'fe80::1ff:fe23:4567:890a')).toBe(
        'fe80::XXXX:XXXX:XXXX:XXXX',
      );
      expect(
        applyPartialMask('ip', '2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
      ).toBe('2001:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX');
    });
  });

  describe('Mode 3: Consistent Pseudonymization', () => {
    it('maps repeated and normalized-equivalent entities to the same placeholder and distinct ones sequentially', () => {
      const aadhaarDigits = buildVerhoeffAadhaar('23456789012');
      const aadhaarHyphen = `${aadhaarDigits.slice(0, 4)}-${aadhaarDigits.slice(4, 8)}-${aadhaarDigits.slice(8, 12)}`;
      const aadhaarSpaced = `${aadhaarDigits.slice(0, 4)} ${aadhaarDigits.slice(4, 8)} ${aadhaarDigits.slice(8, 12)}`;

      const source = [
        'Primary: John@Example.com, repeat: john@example.com, other: sara@example.com',
        'Card A: 4111-1111-1111-1111, Card A spaced: 4111 1111 1111 1111, Card B: 5412345678901232',
        `Aadhaar A: ${aadhaarHyphen}, Aadhaar A spaced: ${aadhaarSpaced}`,
        'Phone A: (415) 555-0199, Phone A dashed: 415-555-0199',
        'IP: 10.0.0.1, PAN: ABCPE1234F',
      ].join('\n');

      const { redaction } = sanitizeText(source, { mode: 'pseudonymize' });

      expect(redaction.sanitizedText).toBe(
        [
          'Primary: [EMAIL_001], repeat: [EMAIL_001], other: [EMAIL_002]',
          'Card A: [CARD_001], Card A spaced: [CARD_001], Card B: [CARD_002]',
          'Aadhaar A: [AADHAAR_001], Aadhaar A spaced: [AADHAAR_001]',
          'Phone A: [PHONE_001], Phone A dashed: [PHONE_001]',
          'IP: [IP_001], PAN: [PAN_001]',
        ].join('\n'),
      );
    });

    it('shares mappings across calls when a PseudonymSession is supplied and resets on clear()', () => {
      const session = createPseudonymSession();

      const first = sanitizeText('Contact john@example.com and 9876543210.', {
        mode: 'pseudonymize',
        pseudonymSession: session,
      });
      expect(first.redaction.sanitizedText).toBe(
        'Contact [EMAIL_001] and [PHONE_001].',
      );
      expect(session.getEntryCount()).toBe(2);

      const second = sanitizeText(
        'Follow up with JOHN@example.com and jane@example.com.',
        {
          mode: 'pseudonymize',
          pseudonymSession: session,
        },
      );
      expect(second.redaction.sanitizedText).toBe(
        'Follow up with [EMAIL_001] and [EMAIL_002].',
      );
      expect(session.getEntryCount()).toBe(3);

      session.clear();
      expect(session.getEntryCount()).toBe(0);

      const afterClear = sanitizeText('New session john@example.com', {
        mode: 'pseudonymize',
        pseudonymSession: session,
      });
      expect(afterClear.redaction.sanitizedText).toBe(
        'New session [EMAIL_001]',
      );
    });
  });

  describe('offset preservation, text integrity, and privacy boundaries', () => {
    it('preserves whitespace, punctuation, and special $& / $$ tokens verbatim with exact offsets', () => {
      const source =
        'Amount $$100 $& $1\tfor "alice@example.org",\n\tnext PAN: ABCPE1234F!';

      const { detection, redaction } = sanitizeText(source, {
        mode: 'partial',
      });

      expect(redaction.sanitizedText).toBe(
        'Amount $$100 $& $1\tfor "a***@example.org",\n\tnext PAN: ABXXXXXX4F!',
      );

      expect(redaction.entities).toHaveLength(detection.entities.length);
      for (let index = 0; index < redaction.entities.length; index += 1) {
        const redacted = redaction.entities[index];
        const detected = detection.entities[index];
        if (!redacted || !detected) {
          continue;
        }

        expect(
          source.slice(redacted.originalStart, redacted.originalEnd),
        ).toBe(detected.value);
        expect(
          redaction.sanitizedText.slice(
            redacted.sanitizedStart,
            redacted.sanitizedEnd,
          ),
        ).toBe(redacted.replacement);
        expect('value' in redacted).toBe(false);
      }

      const serialized = JSON.stringify(redaction.entities);
      expect(serialized).not.toContain('alice@example.org');
      expect(serialized).not.toContain('ABCPE1234F');
    });

    it('returns unchanged text and zero counts for empty or zero-match input', () => {
      for (const input of ['', '   \n\t', 'No personal identifiers here.']) {
        const detection = detectPii(input);
        const redaction = redactDetectedEntities(input, detection, {
          mode: 'full',
        });

        expect(redaction.sanitizedText).toBe(input);
        expect(redaction.entities).toEqual([]);
        expect(redaction.countsByCategory).toEqual(createEmptyCategoryCounts());
        expect(redaction.totalDetected).toBe(0);
        expect(redaction.totalSanitized).toBe(0);
      }
    });

    it('rejects out-of-bounds or overlapping spans in redactDetectedEntities and handles trailing :: IPv6', () => {
      expect(applyPartialMask('ip', '2001:db8::')).toBe('2001:XXXX::');
      expect(applyPartialMask('pan', 'ABC')).toBe('XXX');

      expect(() =>
        redactDetectedEntities(
          'hello',
          {
            entities: [
              {
                id: 'entity_1',
                category: 'email',
                value: 'hello',
                start: 0,
                end: 10,
                validationMethod: 'email-format',
              },
            ],
            countsByCategory: createEmptyCategoryCounts(),
            totalCount: 1,
          },
          { mode: 'full' },
        ),
      ).toThrow(/Invalid or overlapping entity span/);
    });
  });
});
