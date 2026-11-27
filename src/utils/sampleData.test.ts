import { describe, expect, it } from 'vitest';
import { createPseudonymSession, detectPii } from '../engine';
import { PII_CATEGORIES } from '../types/ui';
import { parseCsvSafely, sanitizeCsvText } from './csvProcessor';
import { buildSampleCsvText, buildSampleNoisyText } from './sampleData';

describe('sampleData', () => {
  it('generates noisy sample text containing validated entities in all six PII categories', () => {
    const sample = buildSampleNoisyText();
    const detection = detectPii(sample);

    for (const category of PII_CATEGORIES) {
      expect(detection.countsByCategory[category.id]).toBeGreaterThanOrEqual(1);
    }
    expect(detection.totalCount).toBe(10);
  });

  it('does not falsely flag benign decoy date, timestamp, version, or non-Luhn reference ID', () => {
    const sample = buildSampleNoisyText();
    const detection = detectPii(sample);
    const detectedValues = detection.entities.map((entity) => entity.value);

    expect(detectedValues).not.toContain('2026-11-27');
    expect(detectedValues).not.toContain('14:35:20');
    expect(detectedValues).not.toContain('v2.4.1.0');
    expect(detectedValues).not.toContain('4111-1111-1111-1112');
    expect(detectedValues).not.toContain('INC-2026-0419');
  });

  it('generates valid multi-row CSV sample covering all six PII categories and decoys', () => {
    const csvSample = buildSampleCsvText();
    const parsed = parseCsvSafely(csvSample);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rowCount).toBe(4);
    expect(parsed.columnCount).toBe(9);
    expect(parsed.rows[0]).toEqual([
      'RecordID',
      'FullName',
      'Email',
      'Phone',
      'IPAddress',
      'PAN',
      'GovIDPattern',
      'PaymentCard',
      'Notes',
    ]);

    const result = sanitizeCsvText(csvSample, {
      mode: 'pseudonymize',
      pseudonymSession: createPseudonymSession(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    for (const category of PII_CATEGORIES) {
      expect(result.countsByCategory[category.id]).toBeGreaterThanOrEqual(1);
    }

    const sanitizedParsed = parseCsvSafely(result.sanitizedCsv);
    expect(sanitizedParsed.ok).toBe(true);
    if (!sanitizedParsed.ok) {
      throw new Error(sanitizedParsed.error);
    }

    expect(sanitizedParsed.rows).toHaveLength(4);
    expect(sanitizedParsed.rows[0]).toEqual(parsed.rows[0]);
    expect(result.sanitizedCsv).toContain('2026-11-27');
    expect(result.sanitizedCsv).toContain('v2.4.1.0');
    expect(result.sanitizedCsv).toContain('4111-1111-1111-1112');
    expect(result.sanitizedCsv).not.toContain('rohan.patel@example.org');
    expect(result.sanitizedCsv).not.toContain('ABCPE1234F');
  });
});
