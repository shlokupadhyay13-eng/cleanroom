import type { RedactionMode } from './ui';

export type ActivityAction =
  | 'sanitize'
  | 'upload'
  | 'download'
  | 'copy'
  | 'sample'
  | 'clear'
  | 'mode_change'
  | 'error';

export interface ActivityLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: ActivityAction;
  readonly summary: string;
  readonly mode?: RedactionMode;
  readonly entityCount?: number;
  readonly sourceFormat?: 'text' | 'txt' | 'csv';
}
