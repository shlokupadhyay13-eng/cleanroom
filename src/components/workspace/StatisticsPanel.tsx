import { memo } from 'react';
import { PII_CATEGORIES, type CategoryCounts } from '../../types/ui';
import { Panel } from '../ui/Panel';
import styles from './StatisticsPanel.module.css';

export interface StatisticsPanelProps {
  readonly countsByCategory: CategoryCounts;
  readonly totalDetected: number;
  readonly totalSanitized: number;
}

export const StatisticsPanel = memo(function StatisticsPanel({
  countsByCategory,
  totalDetected,
  totalSanitized,
}: StatisticsPanelProps) {
  return (
    <Panel
      title="Statistics"
      actions={
        <div className={styles.summaryMetrics}>
          <span className={styles.summaryMetric}>
            Total Detected:{' '}
            <strong className={styles.metricValue}>{totalDetected}</strong>
          </span>
          <span className={styles.summaryMetric}>
            Sanitized:{' '}
            <strong className={styles.metricValue}>{totalSanitized}</strong>
          </span>
        </div>
      }
    >
      <div className={styles.statsGrid}>
        {PII_CATEGORIES.map((category) => {
          const count = countsByCategory[category.id];
          const isActive = count > 0;

          return (
            <div
              key={category.id}
              className={[
                styles.statCard,
                isActive ? styles.statCardActive : undefined,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.statLabel}>{category.label}</span>
              <span
                className={[
                  styles.statValue,
                  isActive ? styles.statValueActive : styles.statValueMuted,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.disclaimer}>
        Counts reflect format and checksum validation only, not identity or
        ownership verification.
      </p>
    </Panel>
  );
});
