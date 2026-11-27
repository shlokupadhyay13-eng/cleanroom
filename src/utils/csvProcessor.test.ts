import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { createPseudonymSession } from '../engine';
import { parseCsvSafely, sanitizeCsvText } from './csvProcessor';

describe('csvProcessor', () => {
  it('preserves headers, row/column dimensions, quoted commas, escaped quotes, and embedded newlines across all modes', () => {
    const rawCsv = [
      'id,full_name,notes,email',
      '1,"Doe, John","Contact ""direct"":\nCall +91 98765 43210",john@example.com',
      '2,"Smith, Jane","IP 192.168.1.42, PAN ABCPE1234F",jane@example.com',
    ].join('\n');

    for (const mode of ['full', 'partial', 'pseudonymize'] as const) {
      const result = sanitizeCsvText(rawCsv, { mode });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }

      expect(result.rowCount).toBe(3);
      expect(result.columnCount).toBe(4);
      expect(result.totalDetected).toBe(5);
      expect(result.totalSanitized).toBe(5);

      const reparsed = Papa.parse<string[]>(result.sanitizedCsv, {
        header: false,
        skipEmptyLines: false,
      });
      expect(reparsed.errors).toEqual([]);
      expect(reparsed.data).toHaveLength(3);
      expect(reparsed.data[0]).toEqual(['id', 'full_name', 'notes', 'email']);
      expect(reparsed.data[1]?.[0]).toBe('1');
      expect(reparsed.data[1]?.[1]).toBe('Doe, John');
      expect(reparsed.data[2]?.[1]).toBe('Smith, Jane');

      if (mode === 'full') {
        expect(reparsed.data[1]?.[2]).toBe('Contact "direct":\nCall [REDACTED]');
        expect(reparsed.data[1]?.[3]).toBe('[REDACTED]');
      } else if (mode === 'partial') {
        expect(reparsed.data[1]?.[3]).toBe('j***@example.com');
        expect(reparsed.data[2]?.[2]).toBe(
          'IP 192.XXX.XXX.XXX, PAN ABXXXXXX4F',
        );
      }
    }
  });

  it('maintains consistent pseudonymization across rows and columns', () => {
    const rawCsv = [
      'primary_email,secondary_email,phone',
      'John@Example.com,sara@example.com,+91 98765 43210',
      'john@example.com,John@Example.com,9876543210',
    ].join('\n');

    const session = createPseudonymSession();
    const result = sanitizeCsvText(rawCsv, {
      mode: 'pseudonymize',
      pseudonymSession: session,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const reparsed = Papa.parse<string[]>(result.sanitizedCsv, {
      header: false,
    });
    expect(reparsed.data[1]).toEqual([
      '[EMAIL_001]',
      '[EMAIL_002]',
      '[PHONE_001]',
    ]);
    expect(reparsed.data[2]).toEqual([
      '[EMAIL_001]',
      '[EMAIL_001]',
      '[PHONE_002]',
    ]);
  });

  it('prevents PII from bleeding across adjacent CSV cell boundaries', () => {
    const rawCsv = ['col_a,col_b', '123456,789012'].join('\n');
    const result = sanitizeCsvText(rawCsv, { mode: 'full' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.totalDetected).toBe(0);
    expect(result.sanitizedCsv).toBe('col_a,col_b\n123456,789012');
  });

  it('rejects empty, unclosed-quote, and ragged CSVs without exposing raw PII', () => {
    expect(parseCsvSafely('').ok).toBe(false);
    expect(parseCsvSafely('  \n\n ').ok).toBe(false);

    const unclosed = sanitizeCsvText(
      'name,email\n"Alice,alice@private-corp.org',
      { mode: 'full' },
    );
    expect(unclosed.ok).toBe(false);
    if (!unclosed.ok) {
      expect(unclosed.error).not.toContain('alice@private-corp.org');
    }

    const ragged = sanitizeCsvText(
      'name,email,phone\nAlice,alice@private-corp.org',
      { mode: 'full' },
    );
    expect(ragged.ok).toBe(false);
    if (!ragged.ok) {
      expect(ragged.error).toContain('row 2');
      expect(ragged.error).not.toContain('alice@private-corp.org');
      expect(ragged.error).not.toContain('Alice');
    }
  });
});
