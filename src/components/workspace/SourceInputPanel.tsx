import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from 'react';
import { FileText, Table, Trash2, Upload } from 'lucide-react';
import type { LoadedFileMeta } from '../../types/file';
import type { TextMetrics } from '../../utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import styles from './WorkspaceShell.module.css';

export interface SourceInputPanelProps {
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly sourceText: string;
  readonly sourceMetrics: TextMetrics;
  readonly loadedFile: LoadedFileMeta | null;
  readonly hasError: boolean;
  readonly isDragActive: boolean;
  readonly canClear: boolean;
  readonly onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onLoadSample: () => void;
  readonly onLoadSampleCsv: () => void;
  readonly onClearSource: () => void;
  readonly onDetachFile: () => void;
  readonly onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  readonly onTextareaChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

/**
 * Renders the local source editor with file upload, drag-and-drop ingestion,
 * synthetic sample loaders, file-mode badge detach, and live character/line metrics.
 */
export function SourceInputPanel({
  fileInputRef,
  sourceText,
  sourceMetrics,
  loadedFile,
  hasError,
  isDragActive,
  canClear,
  onFileInputChange,
  onLoadSample,
  onLoadSampleCsv,
  onClearSource,
  onDetachFile,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onTextareaKeyDown,
  onTextareaPaste,
  onTextareaChange,
}: SourceInputPanelProps) {
  return (
    <Panel
      title="Source Input"
      actions={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            className="sr-only"
            aria-label="Upload .txt or .csv file"
            onChange={onFileInputChange}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} strokeWidth={2} aria-hidden="true" />
            <span>Upload File</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onLoadSample}>
            <FileText size={14} strokeWidth={2} aria-hidden="true" />
            <span>Load Sample</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onLoadSampleCsv}>
            <Table size={14} strokeWidth={2} aria-hidden="true" />
            <span>Sample CSV</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canClear}
            onClick={onClearSource}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            <span>Clear</span>
          </Button>
        </>
      }
    >
      {loadedFile && (
        <div className={styles.fileMetaRow}>
          <Badge variant="neutral">
            <span>
              {loadedFile.name} ({loadedFile.format.toUpperCase()})
            </span>
            <button
              type="button"
              className={styles.detachButton}
              aria-label="Detach file and treat input as plain text"
              onClick={onDetachFile}
            >
              <span aria-hidden="true">×</span>
            </button>
          </Badge>
        </div>
      )}
      <div
        className={[
          styles.dropZone,
          isDragActive ? styles.dropZoneActive : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragActive && (
          <p className={styles.dropHint}>
            Drop a .txt or .csv file to load locally
          </p>
        )}
        <label htmlFor="source-input" className="sr-only">
          Source text for PII sanitization
        </label>
        <textarea
          id="source-input"
          className={styles.textarea}
          value={sourceText}
          aria-invalid={hasError}
          aria-describedby="source-input-hint"
          onKeyDown={onTextareaKeyDown}
          onPaste={onTextareaPaste}
          onChange={onTextareaChange}
          placeholder="Paste text containing emails, phone numbers, IP addresses, PAN, Aadhaar, or credit card numbers..."
          rows={12}
        />
      </div>
      <div className={styles.paneFooter}>
        <span id="source-input-hint">
          Tip: Press Ctrl+Enter (or Cmd+Enter) to sanitize locally.
        </span>
        <span className={styles.paneMetric}>
          {sourceMetrics.chars.toLocaleString('en-US')} chars ·{' '}
          {sourceMetrics.lines.toLocaleString('en-US')} lines
        </span>
      </div>
    </Panel>
  );
}
