import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_SIZE_BYTES,
  readLocalFile,
  validateFile,
} from './fileLoader';
import { computeTextMetrics, stripUtf8Bom } from './textNormalization';

describe('fileLoader', () => {
  it('validates and reads a local .txt file', async () => {
    const file = new File(['Contact alice@example.com'], 'notes.txt', {
      type: 'text/plain',
    });

    const validation = validateFile(file);
    expect(validation).toEqual({ ok: true, format: 'txt' });

    const result = await readLocalFile(file);
    expect(result).toEqual({
      ok: true,
      content: 'Contact alice@example.com',
      meta: {
        name: 'notes.txt',
        format: 'txt',
        sizeBytes: file.size,
      },
    });
  });

  it('validates and reads a local .csv file (case-insensitive extension and Excel MIME)', async () => {
    const csvContent = 'name,email\nAlice,alice@example.com\n';
    const file = new File([csvContent], 'EXPORT.CSV', {
      type: 'application/vnd.ms-excel',
    });

    const result = await readLocalFile(file);
    expect(result).toEqual({
      ok: true,
      content: csvContent,
      meta: {
        name: 'EXPORT.CSV',
        format: 'csv',
        sizeBytes: file.size,
      },
    });
  });

  it('rejects unsupported file extensions such as .pdf and .json', async () => {
    const pdfFile = new File(['%PDF-1.4'], 'report.pdf', {
      type: 'application/pdf',
    });
    const jsonFile = new File(['{"a":1}'], 'data.json', {
      type: 'application/json',
    });

    expect((await readLocalFile(pdfFile)).ok).toBe(false);
    expect((await readLocalFile(jsonFile)).ok).toBe(false);
  });

  it('rejects empty (0-byte) and whitespace-only files', async () => {
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
    const whitespaceFile = new File(['   \n\t  '], 'blank.txt', {
      type: 'text/plain',
    });

    expect(await readLocalFile(emptyFile)).toEqual({
      ok: false,
      error: 'The selected file is empty.',
    });
    expect(await readLocalFile(whitespaceFile)).toEqual({
      ok: false,
      error: 'The selected file contains no text content.',
    });
  });

  it('rejects oversized files exceeding 5 MB', () => {
    const oversized = new File(['x'], 'huge.txt', { type: 'text/plain' });
    Object.defineProperty(oversized, 'size', {
      value: MAX_FILE_SIZE_BYTES + 1,
    });

    const validation = validateFile(oversized);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toMatch(/5 MB/i);
    }
  });

  it('rejects binary files containing null bytes', async () => {
    const binaryFile = new File(['abc\u0000def'], 'corrupt.txt', {
      type: 'text/plain',
    });

    const result = await readLocalFile(binaryFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/binary/i);
    }
  });

  it('rejects malformed CSV files on upload without leaking raw PII in errors', async () => {
    const unclosedQuoteCsv =
      'name,email\n"Alice,alice@secret-domain.org\nBob,bob@example.com';
    const mismatchedColumnsCsv =
      'name,email,phone\nAlice,alice@secret-domain.org\n';

    for (const badCsv of [unclosedQuoteCsv, mismatchedColumnsCsv]) {
      const file = new File([badCsv], 'broken.csv', { type: 'text/csv' });
      const result = await readLocalFile(file);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toContain('alice@secret-domain.org');
        expect(result.error).not.toContain('Alice');
      }
    }
  });

  it('normalizes UTF-8 BOMs and computes exact character and line metrics', () => {
    expect(stripUtf8Bom('\uFEFFhello')).toBe('hello');
    expect(stripUtf8Bom('hello')).toBe('hello');

    expect(computeTextMetrics('')).toEqual({ chars: 0, lines: 0 });
    expect(computeTextMetrics('a\nb\r\nc')).toEqual({ chars: 6, lines: 3 });
  });
});
