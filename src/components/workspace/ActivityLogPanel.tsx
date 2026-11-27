import { memo } from 'react';
import { Trash2 } from 'lucide-react';
import type { ActivityAction, ActivityLogEntry } from '../../types/activity';
import type { RedactionMode } from '../../types/ui';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import styles from './ActivityLogPanel.module.css';

const ACTION_LABELS: Record<ActivityAction, string> = {
  sanitize: 'Sanitize',
  upload: 'Upload',
  download: 'Download',
  copy: 'Copy',
  sample: 'Sample',
  clear: 'Clear',
  mode_change: 'Mode',
  error: 'Error',
};

const MODE_LABELS: Record<RedactionMode, string> = {
  full: 'Full Masking',
  partial: 'Partial Masking',
  pseudonymize: 'Consistent Pseudonymization',
};

export interface ActivityLogPanelProps {
  readonly entries: readonly ActivityLogEntry[];
  readonly onClearLog: () => void;
}

export const ActivityLogPanel = memo(function ActivityLogPanel({
  entries,
  onClearLog,
}: ActivityLogPanelProps) {
  return (
    <Panel
      title="Local Activity Log"
      subtitle="Records local operations and settings only. Raw PII is never logged."
      actions={
        <Button
          variant="ghost"
          size="sm"
          disabled={entries.length === 0}
          onClick={onClearLog}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          <span>Clear Log</span>
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className={styles.logEmpty}>
          No processing activity yet. Local logs record operations and settings
          only—never raw PII.
        </p>
      ) : (
        <ol className={styles.logList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.logItem}>
              <div className={styles.logMain}>
                <span className={styles.timestamp}>{entry.timestamp}</span>
                <Badge
                  variant={entry.action === 'sanitize' ? 'primary' : 'neutral'}
                  className={
                    entry.action === 'error' ? styles.errorBadge : undefined
                  }
                >
                  {ACTION_LABELS[entry.action]}
                </Badge>
                <span className={styles.summary}>{entry.summary}</span>
              </div>
              {(entry.mode !== undefined ||
                entry.entityCount !== undefined ||
                entry.sourceFormat !== undefined) && (
                <div className={styles.metaGroup}>
                  {entry.sourceFormat !== undefined && (
                    <span className={styles.metaTag}>
                      {entry.sourceFormat.toUpperCase()}
                    </span>
                  )}
                  {entry.mode !== undefined && (
                    <span className={styles.metaTag}>
                      {MODE_LABELS[entry.mode]}
                    </span>
                  )}
                  {entry.entityCount !== undefined && (
                    <span className={styles.metaTag}>
                      {entry.entityCount}{' '}
                      {entry.entityCount === 1 ? 'entity' : 'entities'}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
});
