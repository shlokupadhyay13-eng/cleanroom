import { memo, useMemo } from 'react';
import type { DetectedEntity } from '../../types/detection';
import type { CsvComparisonData } from '../../types/file';
import type { RedactedEntity } from '../../types/redaction';
import {
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
    const boundedSource =
      plainComparison.sourceText.length > MAX_PREVIEW_CHARS
        ? plainComparison.sourceText.slice(0, MAX_PREVIEW_CHARS)
        : plainComparison.sourceText;
    const boundedEntities =
      plainComparison.sourceText.length > MAX_PREVIEW_CHARS
        ? plainComparison.detectedEntities.filter(
            (entity) => entity.start < MAX_PREVIEW_CHARS,
          )
        : plainComparison.detectedEntities;
    return buildDetectedSegments(boundedSource, boundedEntities);
  }, [plainComparison]);

  const sanitizedSegments = useMemo(() => {
    if (!plainComparison) {
      return [];
    }
    const boundedSanitized =
      plainComparison.sanitizedText.length > MAX_PREVIEW_CHARS
        ? plainComparison.sanitizedText.slice(0, MAX_PREVIEW_CHARS)
        : plainComparison.sanitizedText;
    const boundedEntities =
      plainComparison.sanitizedText.length > MAX_PREVIEW_CHARS
        ? plainComparison.redactedEntities.filter(
            (entity) => entity.sanitizedStart < MAX_PREVIEW_CHARS,
          )
        : plainComparison.redactedEntities;
    return buildSanitizedSegments(boundedSanitized, boundedEntities);
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
          <div className={styles.column}>
            <h3 className={styles.columnHeading}>Detected Entities (Source)</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.csvTable}>
                <caption className="sr-only">
                  Detected PII entities in source CSV data
                </caption>
                <thead>
                  <tr>
                    {csvComparison.headers.map((header, colIndex) => (
                      <th key={`src_h_${colIndex}`} scope="col">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewCsvRows.map((row, rowIndex) => (
                    <tr key={`src_r_${rowIndex}`}>
                      {row.map((cell, colIndex) => (
                        <td key={`src_c_${rowIndex}_${colIndex}`}>
                          <HighlightedText
                            segments={buildDetectedSegments(
                              cell.originalValue,
                              cell.detectedEntities,
                            )}
                            tone="detected"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnHeading}>Sanitized Output</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.csvTable}>
                <caption className="sr-only">
                  Sanitized CSV output comparison preview
                </caption>
                <thead>
                  <tr>
                    {csvComparison.headers.map((header, colIndex) => (
                      <th key={`san_h_${colIndex}`} scope="col">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewCsvRows.map((row, rowIndex) => (
                    <tr key={`san_r_${rowIndex}`}>
                      {row.map((cell, colIndex) => (
                        <td key={`san_c_${rowIndex}_${colIndex}`}>
                          <HighlightedText
                            segments={buildSanitizedSegments(
                              cell.sanitizedValue,
                              cell.redactedEntities,
                            )}
                            tone="sanitized"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
});
