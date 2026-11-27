import Papa from 'papaparse';
import { createPseudonymSession, sanitizeText } from '../engine';
import type { RedactedEntity, RedactionOptions } from '../types/redaction';
import type { CsvComparisonCell, CsvSanitizationResult } from '../types/file';
import { createEmptyCategoryCounts, PII_CATEGORIES } from '../types/ui';
import { stripUtf8Bom } from './textNormalization';

export type CsvParseResult =
  | {
    readonly ok: true;
    readonly rows: string[][];
    readonly rowCount: number;
    readonly columnCount: number;
    readonly newline: '\r\n' | '\n';
  }
  | {
    readonly ok: false;
    readonly error: string;
  };

const MALFORMED_PARSE_CODES = new Set([
  'Quotes',
  'MissingQuotes',
  'InvalidQuotes',
  'UndetectableDelimiter',
]);

function detectLineEnding(rawCsv: string): '\r\n' | '\n' {
  return rawCsv.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeTrailingNewlines(rawCsv: string): string {
  const withoutBom = stripUtf8Bom(rawCsv);
  return withoutBom.replace(/(?:\r?\n)+$/, '');
}

/**
 * Parses raw CSV text in-browser via PapaParse and validates rectangular structure
 * without leaking raw row contents in any error messages.
 */
export function parseCsvSafely(rawCsv: string): CsvParseResult {
  const newline = detectLineEnding(rawCsv);
  const normalized = normalizeTrailingNewlines(rawCsv);

  if (normalized.trim().length === 0) {
    return {
      ok: false,
      error: 'The CSV content is empty.',
    };
  }

  const parsed = Papa.parse<string[]>(normalized, {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  });

  const structuralError = parsed.errors.find(
    (err) =>
      err.type === 'Quotes' ||
      (err.code !== undefined && MALFORMED_PARSE_CODES.has(err.code)),
  );
  if (structuralError) {
    const rowLabel =
      structuralError.row !== undefined
        ? ` near row ${structuralError.row + 1}`
        : '';
    return {
      ok: false,
      error: `Malformed CSV syntax${rowLabel}. Verify that quoted fields and delimiters are balanced.`,
    };
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    return {
      ok: false,
      error: 'The CSV content contains no rows.',
    };
  }

  const headerRow = rows[0];
  const columnCount = headerRow?.length ?? 0;
  if (columnCount === 0) {
    return {
      ok: false,
      error: 'The CSV header row contains no columns.',
    };
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowColumns = row?.length ?? 0;
    if (rowColumns !== columnCount) {
      return {
        ok: false,
        error: `CSV row ${rowIndex + 1} has ${rowColumns} columns, expected ${columnCount}.`,
      };
    }
  }

  return {
    ok: true,
    rows,
    rowCount: rows.length,
    columnCount,
    newline,
  };
}

/**
 * Sanitizes CSV data cell-by-cell while preserving the header row, row/column
 * dimensions, cell boundaries, and RFC 4180 quoting.
 */
export function sanitizeCsvText(
  rawCsv: string,
  options: RedactionOptions,
): CsvSanitizationResult {
  const parsed = parseCsvSafely(rawCsv);
  if (!parsed.ok) {
    return parsed;
  }

  const activeSession =
    options.mode === 'pseudonymize'
      ? (options.pseudonymSession ?? createPseudonymSession())
      : undefined;

  const cellOptions: RedactionOptions = {
    mode: options.mode,
    ...(options.mode === 'pseudonymize'
      ? { pseudonymSession: activeSession }
      : {}),
    ...(options.enabledCategories !== undefined
      ? { enabledCategories: options.enabledCategories }
      : {}),
  };

  const headerRow = parsed.rows[0] ?? [];
  const sanitizedRows: string[][] = [[...headerRow]];
  const comparisonRows: CsvComparisonCell[][] = [];

  const aggregatedCounts = createEmptyCategoryCounts();
  const aggregatedEntities: RedactedEntity[] = [];
  let totalDetected = 0;
  let totalSanitized = 0;

  for (let rowIndex = 1; rowIndex < parsed.rowCount; rowIndex += 1) {
    const sourceRow = parsed.rows[rowIndex] ?? [];
    const sanitizedRow: string[] = [];
    const comparisonRow: CsvComparisonCell[] = [];

    for (let colIndex = 0; colIndex < parsed.columnCount; colIndex += 1) {
      const cellValue = sourceRow[colIndex] ?? '';
      if (cellValue.length === 0) {
        sanitizedRow.push('');
        comparisonRow.push({
          originalValue: '',
          sanitizedValue: '',
          detectedEntities: [],
          redactedEntities: [],
        });
        continue;
      }

      const { detection, redaction } = sanitizeText(cellValue, cellOptions);
      sanitizedRow.push(redaction.sanitizedText);
      comparisonRow.push({
        originalValue: cellValue,
        sanitizedValue: redaction.sanitizedText,
        detectedEntities: detection.entities,
        redactedEntities: redaction.entities,
      });

      totalDetected += redaction.totalDetected;
      totalSanitized += redaction.totalSanitized;

      for (const categoryOption of PII_CATEGORIES) {
        aggregatedCounts[categoryOption.id] +=
          redaction.countsByCategory[categoryOption.id];
      }

      for (const entity of redaction.entities) {
        aggregatedEntities.push({
          ...entity,
          id: `r${rowIndex}_c${colIndex}_${entity.id}`,
        });
      }
    }

    sanitizedRows.push(sanitizedRow);
    comparisonRows.push(comparisonRow);
  }

  const sanitizedCsv = Papa.unparse(sanitizedRows, {
    newline: parsed.newline,
    quotes: false,
  });

  return {
    ok: true,
    sanitizedCsv,
    mode: options.mode,
    rowCount: parsed.rowCount,
    columnCount: parsed.columnCount,
    countsByCategory: aggregatedCounts,
    totalDetected,
    totalSanitized,
    entities: aggregatedEntities,
    comparison: {
      headers: [...headerRow],
      rows: comparisonRows,
    },
  };
}
