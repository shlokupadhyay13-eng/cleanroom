import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Shield } from 'lucide-react';
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
  buildBoundedSanitizedSegments,
  buildSampleCsvText,
  buildSampleNoisyText,
  computeTextMetrics,
  copyTextToClipboard,
  createActivityEntry,
  createSanitizationClient,
  downloadSanitizedText,
  readLocalFile,
  sliceBoundedText,
  type SanitizationClient,
} from '../../utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CategoryFilter } from '../ui/CategoryFilter';
import { ModeSelector } from '../ui/ModeSelector';
import { Panel } from '../ui/Panel';
import { ActivityLogPanel } from './ActivityLogPanel';
import { ComparisonView, MAX_PREVIEW_CHARS } from './ComparisonView';
import { SanitizedOutputPanel } from './SanitizedOutputPanel';
import { SourceInputPanel } from './SourceInputPanel';
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

const INPUT_LIMIT_ERROR =
  'Input exceeds the 5,000,000 character browser processing limit.';

function createAllEnabledCategories(): Set<PiiCategory> {
  return new Set(PII_CATEGORIES.map((category) => category.id));
}

function getModeLabel(mode: RedactionMode): string {
  return REDACTION_MODES.find((item) => item.id === mode)?.label ?? mode;
}

function isFileDragPayload(event: DragEvent<HTMLDivElement>): boolean {
  const { dataTransfer } = event;
  if (!dataTransfer) {
    return false;
  }

  // Ignore internal text-selection drags when browser supplies non-file MIME types.
  if (dataTransfer.types && dataTransfer.types.length > 0) {
    return (
      Array.from(dataTransfer.types).includes('Files') ||
      dataTransfer.files.length > 0
    );
  }

  return true;
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

/**
 * Main interactive workspace coordinating local sanitization, mode/category
 * selection, file/drag ingestion, bounded previews, and PII-free telemetry.
 */
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

  function resetWorkspaceSession(
    nextText: string,
    nextFile: LoadedFileMeta | null,
  ): void {
    runIdRef.current += 1;
    clearCopyFeedback();
    getClient().clearSession();
    setSourceText(nextText);
    setLoadedFile(nextFile);
    setWorkspaceError(null);
    setSanitizedState(null);
    setIsDirtySinceRun(false);
    setProcessingStatus('idle');
  }

  function reportWorkspaceError(
    message: string,
    sourceFormat?: 'text' | 'txt' | 'csv',
  ): void {
    setProcessingStatus('error');
    setWorkspaceError(message);
    recordActivity(
      createActivityEntry({
        action: 'error',
        summary: message,
        ...(sourceFormat !== undefined ? { sourceFormat } : {}),
      }),
    );
  }

  async function executeSanitization(
    input: string,
    mode: RedactionMode,
    format: SupportedFileFormat,
    sourceFormat: 'text' | 'txt' | 'csv',
    categories: ReadonlySet<PiiCategory>,
  ): Promise<void> {
    if (input.trim().length === 0 || categories.size === 0) {
      return;
    }

    if (input.length > MAX_TEXT_INPUT_LENGTH) {
      reportWorkspaceError(INPUT_LIMIT_ERROR, sourceFormat);
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
          reportWorkspaceError(csvResult.error, 'csv');
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
          summary: `Sanitized ${sourceFormat.toUpperCase()} input using ${getModeLabel(mode)} (${redaction.totalSanitized} ${noun}).`,
          mode,
          entityCount: redaction.totalSanitized,
          sourceFormat,
        }),
      );
    } catch {
      if (runIdRef.current !== currentRunId) {
        return;
      }
      reportWorkspaceError(
        'Unable to complete local sanitization for the current input.',
        sourceFormat,
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

  function applyCategorySelection(nextSet: Set<PiiCategory>): void {
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

  function handleToggleCategory(category: PiiCategory): void {
    const nextSet = new Set(enabledCategories);
    if (nextSet.has(category)) {
      nextSet.delete(category);
    } else {
      nextSet.add(category);
    }
    applyCategorySelection(nextSet);
  }

  function handleResetCategories(): void {
    applyCategorySelection(createAllEnabledCategories());
  }

  async function processSelectedFile(file: File): Promise<void> {
    const result = await readLocalFile(file);
    if (!result.ok) {
      reportWorkspaceError(result.error);
      return;
    }

    resetWorkspaceSession(result.content, result.meta);
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
    if (!isFileDragPayload(event)) {
      return;
    }
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
    resetWorkspaceSession(buildSampleNoisyText(), null);
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
    resetWorkspaceSession(csv, {
      name: 'sample-records.csv',
      format: 'csv',
      sizeBytes: new Blob([csv]).size,
    });
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
    resetWorkspaceSession('', null);
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

  function handleDetachFile(): void {
    setLoadedFile(null);
    if (
      sanitizedState !== null &&
      sourceText.trim().length > 0 &&
      enabledCategories.size > 0
    ) {
      void executeSanitization(
        sourceText,
        redactionMode,
        'txt',
        'text',
        enabledCategories,
      );
      return;
    }

    if (workspaceError !== null && processingStatus === 'error') {
      setWorkspaceError(null);
      setProcessingStatus(sanitizedState ? 'ready' : 'idle');
    }
  }

  function handleTextareaPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      loadedFile !== null &&
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === sourceText.length
    ) {
      setLoadedFile(null);
    }
  }

  function handleTextareaChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const nextValue = event.target.value;
    if (nextValue.length > MAX_TEXT_INPUT_LENGTH) {
      reportWorkspaceError(INPUT_LIMIT_ERROR, logSourceFormat);
      return;
    }

    setSourceText(nextValue);
    if (nextValue.trim().length === 0 && loadedFile !== null) {
      setLoadedFile(null);
    }
    if (workspaceError) {
      handleDismissError();
    }
    if (sanitizedState !== null) {
      setIsDirtySinceRun(nextValue !== sanitizedState.sourceSnapshot);
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

  const sourceMetrics = useMemo(
    () => computeTextMetrics(sourceText),
    [sourceText],
  );

  const isOutputPreviewTruncated = Boolean(
    sanitizedState && sanitizedState.sanitizedText.length > MAX_PREVIEW_CHARS,
  );

  const boundedOutputText = useMemo(
    () =>
      sanitizedState
        ? sliceBoundedText(sanitizedState.sanitizedText, MAX_PREVIEW_CHARS)
        : '',
    [sanitizedState],
  );

  const sanitizedOutputSegments = useMemo(() => {
    if (!sanitizedState || sanitizedState.processedFormat === 'csv') {
      return [];
    }
    return buildBoundedSanitizedSegments(
      sanitizedState.sanitizedText,
      sanitizedState.redactedEntities,
      MAX_PREVIEW_CHARS,
    );
  }, [sanitizedState]);

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
        <SourceInputPanel
          fileInputRef={fileInputRef}
          sourceText={sourceText}
          sourceMetrics={sourceMetrics}
          loadedFile={loadedFile}
          hasError={Boolean(workspaceError)}
          isDragActive={isDragActive}
          canClear={canClear}
          onFileInputChange={handleFileInputChange}
          onLoadSample={handleLoadSample}
          onLoadSampleCsv={handleLoadSampleCsv}
          onClearSource={handleClearSource}
          onDetachFile={handleDetachFile}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onTextareaKeyDown={handleTextareaKeyDown}
          onTextareaPaste={handleTextareaPaste}
          onTextareaChange={handleTextareaChange}
        />

        <SanitizedOutputPanel
          isProcessing={processingStatus === 'processing'}
          hasOutput={sanitizedState !== null}
          processedFormat={sanitizedState?.processedFormat ?? null}
          totalDetected={sanitizedState?.totalDetected ?? 0}
          fullLength={sanitizedState?.sanitizedText.length ?? 0}
          boundedOutputText={boundedOutputText}
          sanitizedSegments={sanitizedOutputSegments}
          isPreviewTruncated={isOutputPreviewTruncated}
          canCopyOrDownload={canCopyOrDownload}
          copied={copied}
          copyAnnouncement={copyAnnouncement}
          onCopy={() => {
            void handleCopyOutput();
          }}
          onDownload={handleDownload}
        />
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
