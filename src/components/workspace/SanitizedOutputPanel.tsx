import { Check, Copy, Download } from 'lucide-react';
import type { SupportedFileFormat } from '../../types/file';
import type { HighlightSegment } from '../../utils';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { MAX_PREVIEW_CHARS } from './ComparisonView';
import { HighlightedText } from './HighlightedText';
import styles from './WorkspaceShell.module.css';

export interface SanitizedOutputPanelProps {
  readonly isProcessing: boolean;
  readonly hasOutput: boolean;
  readonly processedFormat: SupportedFileFormat | null;
  readonly totalDetected: number;
  readonly fullLength: number;
  readonly boundedOutputText: string;
  readonly sanitizedSegments: readonly HighlightSegment[];
  readonly isPreviewTruncated: boolean;
  readonly canCopyOrDownload: boolean;
  readonly copied: boolean;
  readonly copyAnnouncement: string;
  readonly onCopy: () => void;
  readonly onDownload: () => void;
}

/**
 * Displays sanitized plain text or CSV output with bounded DOM previews,
 * local clipboard copy, and hardened Blob download actions.
 */
export function SanitizedOutputPanel({
  isProcessing,
  hasOutput,
  processedFormat,
  totalDetected,
  fullLength,
  boundedOutputText,
  sanitizedSegments,
  isPreviewTruncated,
  canCopyOrDownload,
  copied,
  copyAnnouncement,
  onCopy,
  onDownload,
}: SanitizedOutputPanelProps) {
  return (
    <Panel
      title="Sanitized Output"
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canCopyOrDownload}
            onClick={onCopy}
          >
            {copied ? (
              <Check size={14} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy size={14} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canCopyOrDownload}
            onClick={onDownload}
          >
            <Download size={14} strokeWidth={2} aria-hidden="true" />
            <span>Download</span>
          </Button>
          <span role="status" aria-live="polite" className="sr-only">
            {copyAnnouncement}
          </span>
        </>
      }
    >
      <div
        aria-busy={isProcessing}
        className={[
          styles.outputBox,
          hasOutput ? styles.outputBoxPopulated : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {hasOutput ? (
          <div className={styles.outputContent}>
            {totalDetected === 0 && (
              <p className={styles.zeroMatchBanner}>
                Processed locally — no supported PII patterns were detected.
              </p>
            )}
            {isPreviewTruncated && (
              <p className={styles.zeroMatchBanner}>
                Showing first {MAX_PREVIEW_CHARS.toLocaleString('en-US')} of{' '}
                {fullLength.toLocaleString('en-US')} characters in this preview.
                Copy and Download include the complete sanitized output.
              </p>
            )}
            {processedFormat === 'csv' ? (
              <pre className={styles.outputPre}>{boundedOutputText}</pre>
            ) : (
              <HighlightedText
                segments={sanitizedSegments}
                tone="sanitized"
                className={styles.outputHighlighted}
              />
            )}
          </div>
        ) : (
          <p className={styles.emptyState}>
            Paste text, upload a .txt or .csv file, or load sample text, then
            click Sanitize.
          </p>
        )}
      </div>
      <div className={styles.paneFooter}>
        <span>
          {processedFormat === null
            ? 'Output: Awaiting sanitization'
            : `Output: Ready (${processedFormat.toUpperCase()})`}
        </span>
        <span className={styles.paneMetric}>
          {hasOutput ? `${fullLength.toLocaleString('en-US')} chars` : ''}
        </span>
      </div>
    </Panel>
  );
}
