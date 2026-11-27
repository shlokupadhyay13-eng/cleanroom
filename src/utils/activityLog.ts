import { detectPii, redactDetectedEntities } from '../engine';
import type { ActivityAction, ActivityLogEntry } from '../types/activity';
import type { RedactionMode } from '../types/ui';

export const MAX_ACTIVITY_LOG_ENTRIES = 50;
const MAX_SUMMARY_LENGTH = 240;

let entrySequence = 0;

export interface CreateActivityEntryParams {
  readonly action: ActivityAction;
  readonly summary: string;
  readonly mode?: RedactionMode;
  readonly entityCount?: number;
  readonly sourceFormat?: 'text' | 'txt' | 'csv';
  readonly date?: Date;
}

/**
 * Defense-in-depth guard ensuring no accidentally passed raw PII or multiline
 * text enters the local activity log.
 */
export function sanitizeLogSummary(rawSummary: string): string {
  const singleLine = rawSummary.replace(/[\r\n\t]+/g, ' ').trim();
  if (singleLine.length === 0) {
    return 'Local operation recorded.';
  }

  const detection = detectPii(singleLine);
  const redacted =
    detection.totalCount > 0
      ? redactDetectedEntities(singleLine, detection, { mode: 'full' })
          .sanitizedText
      : singleLine;

  if (redacted.length <= MAX_SUMMARY_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
}

export function formatLocalTimestamp(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function createActivityEntry(
  params: CreateActivityEntryParams,
): ActivityLogEntry {
  entrySequence += 1;

  return {
    id: `activity_${entrySequence}`,
    timestamp: formatLocalTimestamp(params.date),
    action: params.action,
    summary: sanitizeLogSummary(params.summary),
    ...(params.mode !== undefined ? { mode: params.mode } : {}),
    ...(params.entityCount !== undefined
      ? { entityCount: params.entityCount }
      : {}),
    ...(params.sourceFormat !== undefined
      ? { sourceFormat: params.sourceFormat }
      : {}),
  };
}

export function appendActivityEntry(
  entries: readonly ActivityLogEntry[],
  next: ActivityLogEntry,
): ActivityLogEntry[] {
  return [next, ...entries].slice(0, MAX_ACTIVITY_LOG_ENTRIES);
}
