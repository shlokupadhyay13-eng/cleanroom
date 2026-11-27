import { memo, useMemo } from 'react';
import type { DetectedEntity } from '../../types/detection';
import type { CsvComparisonCell, CsvComparisonData } from '../../types/file';
import type { RedactedEntity } from '../../types/redaction';
import {
  buildBoundedDetectedSegments,
  buildBoundedSanitizedSegments,
  buildDetectedSegments,
  buildSanitizedSegments,
} from '../../utils';
import { Panel } from '../ui/Panel';
import { HighlightedText } from './HighlightedText';
import styles from './ComparisonView.module.css';

export const MAX_PREVIEW_CHARS = 100_000;
export const MAX_CSV_PREVIEW_ROWS = 200;

export interface PlainComparisonInput {
  readonly sourceText: string;
  readonly detectedEntities: readonly DetectedEntity[];
  readonly sanitizedText: string;
  readonly redactedEntities: readonly RedactedEntity[];
}

export interface ComparisonViewProps {
  readonly totalDetected: number;
  readonly plainComparison?: PlainComparisonInput;
  readonly csvComparison?: CsvComparisonData;
}

interface CsvComparisonTableProps {
  readonly heading: string;
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly CsvComparisonCell[])[];
  readonly tone: 'detected' | 'sanitized';
  readonly keyPrefix: string;
}

const CsvComparisonTable = memo(function CsvComparisonTable({
  heading,
  caption,
  headers,
  rows,
  tone,
  keyPrefix,
}: CsvComparisonTableProps) {
  return (
    <div className={styles.column}>
      <h3 className={styles.columnHeading}>{heading}</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.csvTable}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((header, colIndex) => (
                <th key={`${keyPrefix}_h_${colIndex}`} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${keyPrefix}_r_${rowIndex}`}>
                {row.map((cell, colIndex) => (
                  <td key={`${keyPrefix}_c_${rowIndex}_${colIndex}`}>
                    <HighlightedText
                      segments={
                        tone === 'detected'
                          ? buildDetectedSegments(
                              cell.originalValue,
                              cell.detectedEntities,
                            )
                          : buildSanitizedSegments(
                              cell.sanitizedValue,
                              cell.redactedEntities,
                            )
                      }
                      tone={tone}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/**
 * Renders paired side-by-side comparison views for plain text or CSV tables
 * with bounded DOM preview sizes to maintain responsiveness on large documents.
 */
export const ComparisonView = memo(function ComparisonView({
  totalDetected,
  plainComparison,
  csvComparison,
}: ComparisonViewProps) {
  const isPlainTruncated = Boolean(
    plainComparison &&
      (plainComparison.sourceText.length > MAX_PREVIEW_CHARS ||
        plainComparison.sanitizedText.length > MAX_PREVIEW_CHARS),
  );

  const detectedSegments = useMemo(() => {
    if (!plainComparison) {
      return [];
    }
    return buildBoundedDetectedSegments(
      plainComparison.sourceText,
      plainComparison.detectedEntities,
      MAX_PREVIEW_CHARS,
    );
  }, [plainComparison]);

  const sanitizedSegments = useMemo(() => {
    if (!plainComparison) {
      return [];
    }
    return buildBoundedSanitizedSegments(
      plainComparison.sanitizedText,
      plainComparison.redactedEntities,
      MAX_PREVIEW_CHARS,
    );
  }, [plainComparison]);

  const isCsvTruncated = Boolean(
    csvComparison && csvComparison.rows.length > MAX_CSV_PREVIEW_ROWS,
  );

  const previewCsvRows = useMemo(() => {
    if (!csvComparison) {
      return [];
    }
    return csvComparison.rows.length > MAX_CSV_PREVIEW_ROWS
      ? csvComparison.rows.slice(0, MAX_CSV_PREVIEW_ROWS)
      : csvComparison.rows;
  }, [csvComparison]);

  return (
    <Panel
      title="Side-by-Side Comparison"
      actions={
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatchDetected} aria-hidden="true" />
            <span>Detected PII</span>
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchSanitized} aria-hidden="true" />
            <span>Sanitized Replacement</span>
          </span>
        </div>
      }
    >
      {totalDetected === 0 && (
        <p className={styles.noMatchNote}>
          No supported PII patterns were detected in the current input.
        </p>
      )}

      {isPlainTruncated && plainComparison && (
        <p className={styles.previewNotice}>
          Showing first {MAX_PREVIEW_CHARS.toLocaleString('en-US')} characters in
          the visual preview to keep the browser responsive. Copy and Download
          include the complete sanitized document.
        </p>
      )}

      {isCsvTruncated && csvComparison && (
        <p className={styles.previewNotice}>
          Showing first {MAX_CSV_PREVIEW_ROWS.toLocaleString('en-US')} of{' '}
          {csvComparison.rows.length.toLocaleString('en-US')} CSV rows in the
          visual preview to keep the browser responsive. Copy and Download include
          the complete sanitized file.
        </p>
      )}

      {plainComparison && (
        <div className={styles.comparisonGrid}>
          <div className={styles.column}>
            <h3 className={styles.columnHeading}>Detected Entities (Source)</h3>
            <div className={styles.textPane}>
              <HighlightedText segments={detectedSegments} tone="detected" />
            </div>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnHeading}>Sanitized Output</h3>
            <div className={styles.textPane}>
              <HighlightedText segments={sanitizedSegments} tone="sanitized" />
            </div>
          </div>
        </div>
      )}

      {csvComparison && (
        <div className={styles.comparisonGrid}>
          <CsvComparisonTable
            heading="Detected Entities (Source)"
            caption="Detected PII entities in source CSV data"
            headers={csvComparison.headers}
            rows={previewCsvRows}
            tone="detected"
            keyPrefix="src"
          />
          <CsvComparisonTable
            heading="Sanitized Output"
            caption="Sanitized CSV output comparison preview"
            headers={csvComparison.headers}
            rows={previewCsvRows}
            tone="sanitized"
            keyPrefix="san"
          />
        </div>
      )}
    </Panel>
  );
});
