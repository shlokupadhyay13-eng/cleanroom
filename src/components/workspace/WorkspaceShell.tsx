import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Shield,
  Table,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ActivityLogEntry } from '../../types/activity';
import type { DetectedEntity } from '../../types/detection';
import type {
  CsvComparisonData,
  LoadedFileMeta,
  SupportedFileFormat,
} from '../../types/file';
import type { RedactedEntity } from '../../types/redaction';
import {
  PII_CATEGORIES,
  REDACTION_MODES,
  createEmptyCategoryCounts,
  type CategoryCounts,
  type PiiCategory,
  type ProcessingStatus,
  type RedactionMode,
} from '../../types/ui';
import {
  MAX_TEXT_INPUT_LENGTH,
  appendActivityEntry,
  buildSampleCsvText,
  buildSampleNoisyText,
  buildSanitizedSegments,
  copyTextToClipboard,
  createActivityEntry,
  createSanitizationClient,
  downloadSanitizedText,
  readLocalFile,
  type SanitizationClient,
} from '../../utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CategoryFilter } from '../ui/CategoryFilter';
import { ModeSelector } from '../ui/ModeSelector';
import { Panel } from '../ui/Panel';
import { ActivityLogPanel } from './ActivityLogPanel';
import { ComparisonView, MAX_PREVIEW_CHARS } from './ComparisonView';
import { HighlightedText } from './HighlightedText';
import { StatisticsPanel } from './StatisticsPanel';
import styles from './WorkspaceShell.module.css';

interface SanitizedWorkspaceState {
  readonly processedFormat: SupportedFileFormat;
  readonly processedMode: RedactionMode;
  readonly sourceSnapshot: string;
  readonly sanitizedText: string;
  readonly countsByCategory: CategoryCounts;
  readonly totalDetected: number;
  readonly totalSanitized: number;
  readonly detectedEntities: DetectedEntity[];
  readonly redactedEntities: RedactedEntity[];
  readonly csvComparison?: CsvComparisonData;
}

function createAllEnabledCategories(): Set<PiiCategory> {
  return new Set(PII_CATEGORIES.map((category) => category.id));
}

function getModeLabel(mode: RedactionMode): string {
  return REDACTION_MODES.find((item) => item.id === mode)?.label ?? mode;
}

function formatStatusLabel(
  status: ProcessingStatus,
  sanitizedState: SanitizedWorkspaceState | null,
  isDirtySinceRun: boolean,
  enabledCount: number,
): string {
  if (enabledCount === 0 && status !== 'processing' && status !== 'error') {
    return 'Enable at least one PII category to sanitize.';
  }

  switch (status) {
    case 'idle':
      return 'Status: Idle';
    case 'processing':
      return 'Status: Processing...';
    case 'error':
      return 'Status: Error';
    case 'ready': {
      if (isDirtySinceRun) {
        return 'Status: Input modified — click Sanitize to refresh';
      }
      const count = sanitizedState?.totalSanitized ?? 0;
      if (count === 0) {
        return 'Status: Ready — No PII detected';
      }
      const noun = count === 1 ? 'entity' : 'entities';
      return `Status: Ready — ${count} ${noun} sanitized`;
    }
  }
}

export function WorkspaceShell() {
  const [redactionMode, setRedactionMode] = useState<RedactionMode>('full');
  const [enabledCategories, setEnabledCategories] = useState<Set<PiiCategory>>(
    createAllEnabledCategories,
  );
  const [sourceText, setSourceText] = useState<string>('');
  const [loadedFile, setLoadedFile] = useState<LoadedFileMeta | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] =
    useState<ProcessingStatus>('idle');
  const [isDirtySinceRun, setIsDirtySinceRun] = useState<boolean>(false);
  const [sanitizedState, setSanitizedState] =
    useState<SanitizedWorkspaceState | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>(
    [],
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clientRef = useRef<SanitizationClient | null>(null);
  const runIdRef = useRef<number>(0);
  const copyTimerRef = useRef<number | null>(null);
  const dragDepthRef = useRef<number>(0);

  const activeFormat: SupportedFileFormat =
    loadedFile?.format === 'csv' ? 'csv' : 'txt';
  const logSourceFormat: 'text' | 'txt' | 'csv' = loadedFile?.format ?? 'text';

  useEffect(() => {
    const client = createSanitizationClient();
    clientRef.current = client;

    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  function getClient(): SanitizationClient {
    if (!clientRef.current) {
      clientRef.current = createSanitizationClient();
    }
    return clientRef.current;
  }

  function clearCopyFeedback(): void {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopied(false);
    setCopyAnnouncement('');
  }

  const recordActivity = useCallback((entry: ActivityLogEntry): void => {
    setActivityEntries((prev) => appendActivityEntry(prev, entry));
  }, []);

  const handleClearLog = useCallback((): void => {
    setActivityEntries([]);
  }, []);

  async function executeSanitization(
    input: string,
    mode: RedactionMode,
    format: SupportedFileFormat,
    sourceLogFormat: 'text' | 'txt' | 'csv',
    categories: ReadonlySet<PiiCategory>,
  ): Promise<void> {
    if (input.trim().length === 0 || categories.size === 0) {
      return;
    }

    if (input.length > MAX_TEXT_INPUT_LENGTH) {
      const limitMessage =
        'Input exceeds the 5,000,000 character browser processing limit.';
      setProcessingStatus('error');
      setWorkspaceError(limitMessage);
      recordActivity(
        createActivityEntry({
          action: 'error',
          summary: limitMessage,
          sourceFormat: sourceLogFormat,
        }),
      );
      return;
    }

    runIdRef.current += 1;
    const currentRunId = runIdRef.current;

    clearCopyFeedback();
    setProcessingStatus('processing');
    setWorkspaceError(null);

    const client = getClient();

    try {
      if (format === 'csv') {
        const { result: csvResult } = await client.sanitizeCsvAsync(
          input,
          mode,
          categories,
        );
        if (runIdRef.current !== currentRunId) {
          return;
        }

        if (!csvResult.ok) {
          setProcessingStatus('error');
          setWorkspaceError(csvResult.error);
          recordActivity(
            createActivityEntry({
              action: 'error',
              summary: csvResult.error,
              sourceFormat: 'csv',
            }),
          );
          return;
        }

        setSanitizedState({
          processedFormat: 'csv',
          processedMode: mode,
          sourceSnapshot: input,
          sanitizedText: csvResult.sanitizedCsv,
          countsByCategory: csvResult.countsByCategory,
          totalDetected: csvResult.totalDetected,
          totalSanitized: csvResult.totalSanitized,
          detectedEntities: [],
          redactedEntities: csvResult.entities,
          csvComparison: csvResult.comparison,
        });
        setIsDirtySinceRun(false);
        setProcessingStatus('ready');

        const noun = csvResult.totalSanitized === 1 ? 'entity' : 'entities';
        recordActivity(
          createActivityEntry({
            action: 'sanitize',
            summary: `Sanitized CSV input using ${getModeLabel(mode)} (${csvResult.totalSanitized} ${noun}).`,
            mode,
            entityCount: csvResult.totalSanitized,
            sourceFormat: 'csv',
          }),
        );
        return;
      }

      const { detection, redaction } = await client.sanitizeTextAsync(
        input,
        mode,
        categories,
      );
      if (runIdRef.current !== currentRunId) {
        return;
      }

      setSanitizedState({
        processedFormat: 'txt',
        processedMode: mode,
        sourceSnapshot: input,
        sanitizedText: redaction.sanitizedText,
        countsByCategory: redaction.countsByCategory,
        totalDetected: redaction.totalDetected,
        totalSanitized: redaction.totalSanitized,
        detectedEntities: detection.entities,
        redactedEntities: redaction.entities,
      });
      setIsDirtySinceRun(false);
      setProcessingStatus('ready');

      const noun = redaction.totalSanitized === 1 ? 'entity' : 'entities';
      recordActivity(
        createActivityEntry({
          action: 'sanitize',
          summary: `Sanitized ${sourceLogFormat.toUpperCase()} input using ${getModeLabel(mode)} (${redaction.totalSanitized} ${noun}).`,
          mode,
          entityCount: redaction.totalSanitized,
          sourceFormat: sourceLogFormat,
        }),
      );
    } catch {
      if (runIdRef.current !== currentRunId) {
        return;
      }
      const fallbackError =
        'Unable to complete local sanitization for the current input.';
      setProcessingStatus('error');
      setWorkspaceError(fallbackError);
      recordActivity(
        createActivityEntry({
          action: 'error',
          summary: fallbackError,
          sourceFormat: sourceLogFormat,
        }),
      );
    }
  }

  function handleSanitizeClick(): void {
    void executeSanitization(
      sourceText,
      redactionMode,
      activeFormat,
      logSourceFormat,
      enabledCategories,
    );
  }

  function handleModeChange(nextMode: RedactionMode): void {
    setRedactionMode(nextMode);
    recordActivity(
      createActivityEntry({
        action: 'mode_change',
        summary: 'Updated redaction mode.',
        mode: nextMode,
      }),
    );

    if (
      sanitizedState !== null &&
      sourceText.trim().length > 0 &&
      enabledCategories.size > 0
    ) {
      void executeSanitization(
        sourceText,
        nextMode,
        activeFormat,
        logSourceFormat,
        enabledCategories,
      );
    }
  }

  function handleToggleCategory(category: PiiCategory): void {
    const nextSet = new Set(enabledCategories);
    if (nextSet.has(category)) {
      nextSet.delete(category);
    } else {
      nextSet.add(category);
    }

    setEnabledCategories(nextSet);
    recordActivity(
      createActivityEntry({
        action: 'mode_change',
        summary: `Updated active PII categories (${nextSet.size} of ${PII_CATEGORIES.length} enabled).`,
      }),
    );

    if (
      sanitizedState !== null &&
      sourceText.trim().length > 0 &&
      nextSet.size > 0
    ) {
      void executeSanitization(
        sourceText,
        redactionMode,
        activeFormat,
        logSourceFormat,
        nextSet,
      );
    }
  }

  function handleResetCategories(): void {
    const nextSet = createAllEnabledCategories();
    setEnabledCategories(nextSet);
    recordActivity(
      createActivityEntry({
        action: 'mode_change',
        summary: `Updated active PII categories (${nextSet.size} of ${PII_CATEGORIES.length} enabled).`,
      }),
    );

    if (sanitizedState !== null && sourceText.trim().length > 0) {
      void executeSanitization(
        sourceText,
        redactionMode,
        activeFormat,
        logSourceFormat,
        nextSet,
      );
    }
  }

  async function processSelectedFile(file: File): Promise<void> {
    const result = await readLocalFile(file);
    if (!result.ok) {
      setWorkspaceError(result.error);
      setProcessingStatus('error');
      recordActivity(
        createActivityEntry({
          action: 'error',
          summary: result.error,
        }),
      );
      return;
    }

    runIdRef.current += 1;
    clearCopyFeedback();
    getClient().clearSession();
    setSourceText(result.content);
    setLoadedFile(result.meta);
    setWorkspaceError(null);
    setSanitizedState(null);
    setIsDirtySinceRun(false);
    setProcessingStatus('idle');

    recordActivity(
      createActivityEntry({
        action: 'upload',
        summary: `Loaded local ${result.meta.format.toUpperCase()} file (${result.meta.sizeBytes} bytes).`,
        sourceFormat: result.meta.format,
      }),
    );
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) {
      return;
    }

    void processSelectedFile(selectedFile);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
  }

  function handleDragLeave(): void {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      void processSelectedFile(droppedFile);
    }
  }

  function handleLoadSample(): void {
    runIdRef.current += 1;
    clearCopyFeedback();
    getClient().clearSession();
    setSourceText(buildSampleNoisyText());
    setLoadedFile(null);
    setWorkspaceError(null);
    setSanitizedState(null);
    setIsDirtySinceRun(false);
    setProcessingStatus('idle');

    recordActivity(
      createActivityEntry({
        action: 'sample',
        summary:
          'Loaded synthetic sample noisy text across all six PII categories.',
        sourceFormat: 'text',
      }),
    );
  }

  function handleLoadSampleCsv(): void {
    const csv = buildSampleCsvText();
    runIdRef.current += 1;
    clearCopyFeedback();
    getClient().clearSession();
    setSourceText(csv);
    setLoadedFile({
      name: 'sample-records.csv',
      format: 'csv',
      sizeBytes: new Blob([csv]).size,
    });
    setWorkspaceError(null);
    setSanitizedState(null);
    setIsDirtySinceRun(false);
    setProcessingStatus('idle');

    recordActivity(
      createActivityEntry({
        action: 'sample',
        summary: 'Loaded synthetic sample CSV dataset.',
        sourceFormat: 'csv',
      }),
    );
  }

  async function handleCopyOutput(): Promise<void> {
    if (!sanitizedState || sanitizedState.sanitizedText.length === 0) {
      return;
    }

    const result = await copyTextToClipboard(sanitizedState.sanitizedText);
    if (!result.ok) {
      clearCopyFeedback();
      setWorkspaceError(result.error);
      recordActivity(
        createActivityEntry({
          action: 'error',
          summary: 'Clipboard copy failed in current browser context.',
        }),
      );
      return;
    }

    clearCopyFeedback();
    setCopied(true);
    setCopyAnnouncement('Sanitized output copied to clipboard.');
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyAnnouncement('');
      copyTimerRef.current = null;
    }, 2000);

    recordActivity(
      createActivityEntry({
        action: 'copy',
        summary: 'Copied sanitized output to clipboard.',
        mode: sanitizedState.processedMode,
        entityCount: sanitizedState.totalSanitized,
        sourceFormat:
          sanitizedState.processedFormat === 'csv' ? 'csv' : logSourceFormat,
      }),
    );
  }

  function handleDownload(): void {
    if (!sanitizedState || sanitizedState.sanitizedText.length === 0) {
      return;
    }

    downloadSanitizedText(
      sanitizedState.sanitizedText,
      sanitizedState.processedFormat,
      loadedFile?.name ?? null,
    );

    const downloadFormat = sanitizedState.processedFormat;
    recordActivity(
      createActivityEntry({
        action: 'download',
        summary: `Downloaded sanitized ${downloadFormat.toUpperCase()} output.`,
        mode: sanitizedState.processedMode,
        entityCount: sanitizedState.totalSanitized,
        sourceFormat: downloadFormat,
      }),
    );
  }

  function handleClearSource(): void {
    runIdRef.current += 1;
    clearCopyFeedback();
    getClient().clearSession();
    setSourceText('');
    setLoadedFile(null);
    setWorkspaceError(null);
    setSanitizedState(null);
    setIsDirtySinceRun(false);
    setProcessingStatus('idle');

    recordActivity(
      createActivityEntry({
        action: 'clear',
        summary: 'Workspace cleared and local pseudonymization session reset.',
      }),
    );
  }

  function handleDismissError(): void {
    setWorkspaceError(null);
    if (processingStatus === 'error') {
      setProcessingStatus(sanitizedState ? 'ready' : 'idle');
    }
  }

  function handleTextareaKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === 'Enter' &&
      sourceText.trim().length > 0 &&
      enabledCategories.size > 0 &&
      processingStatus !== 'processing'
    ) {
      event.preventDefault();
      handleSanitizeClick();
    }
  }

  const sourceMetrics = useMemo(() => {
    if (sourceText.length === 0) {
      return { chars: 0, lines: 0 };
    }
    return {
      chars: sourceText.length,
      lines: sourceText.split(/\r?\n/).length,
    };
  }, [sourceText]);

  const isOutputPreviewTruncated = Boolean(
    sanitizedState && sanitizedState.sanitizedText.length > MAX_PREVIEW_CHARS,
  );

  const boundedOutputText = useMemo(() => {
    if (!sanitizedState) {
      return '';
    }
    return sanitizedState.sanitizedText.length > MAX_PREVIEW_CHARS
      ? sanitizedState.sanitizedText.slice(0, MAX_PREVIEW_CHARS)
      : sanitizedState.sanitizedText;
  }, [sanitizedState]);

  const sanitizedOutputSegments = useMemo(() => {
    if (!sanitizedState || sanitizedState.processedFormat === 'csv') {
      return [];
    }
    const boundedEntities =
      sanitizedState.sanitizedText.length > MAX_PREVIEW_CHARS
        ? sanitizedState.redactedEntities.filter(
            (entity) => entity.sanitizedStart < MAX_PREVIEW_CHARS,
          )
        : sanitizedState.redactedEntities;
    return buildSanitizedSegments(boundedOutputText, boundedEntities);
  }, [boundedOutputText, sanitizedState]);

  const plainComparisonInput = useMemo(() => {
    if (!sanitizedState || sanitizedState.processedFormat !== 'txt') {
      return undefined;
    }
    return {
      sourceText: sanitizedState.sourceSnapshot,
      detectedEntities: sanitizedState.detectedEntities,
      sanitizedText: sanitizedState.sanitizedText,
      redactedEntities: sanitizedState.redactedEntities,
    };
  }, [sanitizedState]);

  const canSanitize =
    sourceText.trim().length > 0 &&
    enabledCategories.size > 0 &&
    processingStatus !== 'processing';
  const canCopyOrDownload =
    sanitizedState !== null && sanitizedState.sanitizedText.length > 0;
  const canClear =
    sourceText.length > 0 ||
    loadedFile !== null ||
    workspaceError !== null ||
    sanitizedState !== null;

  const statusText = formatStatusLabel(
    processingStatus,
    sanitizedState,
    isDirtySinceRun,
    enabledCategories.size,
  );

  return (
    <div className={styles.workspace}>
      <Panel className={styles.controlPanel}>
        <div className={styles.controlStack}>
          <div className={styles.controlBar}>
            <ModeSelector value={redactionMode} onChange={handleModeChange} />
            <div className={styles.controlActions}>
              <div
                role="status"
                aria-live="polite"
                className={styles.statusContainer}
              >
                <Badge variant="neutral">{statusText}</Badge>
              </div>
              <Button
                variant="primary"
                size="md"
                disabled={!canSanitize}
                onClick={handleSanitizeClick}
              >
                <Shield size={15} strokeWidth={2} aria-hidden="true" />
                <span>Sanitize</span>
              </Button>
            </div>
          </div>

          <CategoryFilter
            enabledCategories={enabledCategories}
            onToggleCategory={handleToggleCategory}
            onResetAll={handleResetCategories}
            disabled={processingStatus === 'processing'}
          />
        </div>
      </Panel>

      {workspaceError && (
        <div role="alert" className={styles.errorAlert}>
          <span className={styles.errorMessage}>{workspaceError}</span>
          <Button variant="ghost" size="sm" onClick={handleDismissError}>
            Dismiss
          </Button>
        </div>
      )}

      <div className={styles.editorGrid}>
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
                onChange={handleFileInputChange}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} strokeWidth={2} aria-hidden="true" />
                <span>Upload File</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                <FileText size={14} strokeWidth={2} aria-hidden="true" />
                <span>Load Sample</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLoadSampleCsv}
              >
                <Table size={14} strokeWidth={2} aria-hidden="true" />
                <span>Sample CSV</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canClear}
                onClick={handleClearSource}
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
                {loadedFile.name} ({loadedFile.format.toUpperCase()})
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
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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
              aria-invalid={Boolean(workspaceError)}
              aria-describedby="source-input-hint"
              onKeyDown={handleTextareaKeyDown}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (nextValue.length > MAX_TEXT_INPUT_LENGTH) {
                  const limitMessage =
                    'Input exceeds the 5,000,000 character browser processing limit.';
                  setWorkspaceError(limitMessage);
                  setProcessingStatus('error');
                  recordActivity(
                    createActivityEntry({
                      action: 'error',
                      summary: limitMessage,
                      sourceFormat: logSourceFormat,
                    }),
                  );
                  return;
                }
                setSourceText(nextValue);
                if (workspaceError) {
                  handleDismissError();
                }
                if (sanitizedState !== null) {
                  setIsDirtySinceRun(nextValue !== sanitizedState.sourceSnapshot);
                }
              }}
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

        <Panel
          title="Sanitized Output"
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canCopyOrDownload}
                onClick={() => {
                  void handleCopyOutput();
                }}
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
                onClick={handleDownload}
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
            aria-busy={processingStatus === 'processing'}
            className={[
              styles.outputBox,
              sanitizedState !== null ? styles.outputBoxPopulated : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {sanitizedState !== null ? (
              <div className={styles.outputContent}>
                {sanitizedState.totalDetected === 0 && (
                  <p className={styles.zeroMatchBanner}>
                    Processed locally — no supported PII patterns were detected.
                  </p>
                )}
                {isOutputPreviewTruncated && (
                  <p className={styles.zeroMatchBanner}>
                    Showing first {MAX_PREVIEW_CHARS.toLocaleString('en-US')} of{' '}
                    {sanitizedState.sanitizedText.length.toLocaleString('en-US')}{' '}
                    characters in this preview. Copy and Download include the
                    complete sanitized output.
                  </p>
                )}
                {sanitizedState.processedFormat === 'csv' ? (
                  <pre className={styles.outputPre}>{boundedOutputText}</pre>
                ) : (
                  <HighlightedText
                    segments={sanitizedOutputSegments}
                    tone="sanitized"
                    className={styles.outputHighlighted}
                  />
                )}
              </div>
            ) : (
              <p className={styles.emptyState}>
                Paste text, upload a .txt or .csv file, or load sample text,
                then click Sanitize.
              </p>
            )}
          </div>
          <div className={styles.paneFooter}>
            <span>
              {sanitizedState === null
                ? 'Output: Awaiting sanitization'
                : `Output: Ready (${sanitizedState.processedFormat.toUpperCase()})`}
            </span>
            <span className={styles.paneMetric}>
              {sanitizedState !== null
                ? `${sanitizedState.sanitizedText.length.toLocaleString('en-US')} chars`
                : ''}
            </span>
          </div>
        </Panel>
      </div>

      {sanitizedState !== null && (
        <ComparisonView
          totalDetected={sanitizedState.totalDetected}
          plainComparison={plainComparisonInput}
          csvComparison={sanitizedState.csvComparison}
        />
      )}

      <div className={styles.lowerGrid}>
        <StatisticsPanel
          countsByCategory={
            sanitizedState?.countsByCategory ?? createEmptyCategoryCounts()
          }
          totalDetected={sanitizedState?.totalDetected ?? 0}
          totalSanitized={sanitizedState?.totalSanitized ?? 0}
        />

        <ActivityLogPanel
          entries={activityEntries}
          onClearLog={handleClearLog}
        />
      </div>
    </div>
  );
}
