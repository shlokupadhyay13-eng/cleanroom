import { memo } from 'react';
import type { PiiCategory } from '../../types/ui';
import type { HighlightSegment } from '../../utils';
import styles from './HighlightedText.module.css';

const CATEGORY_SINGULAR_LABELS: Record<PiiCategory, string> = {
  email: 'Email Address',
  phone: 'Phone Number',
  ip: 'IP Address',
  pan: 'PAN Number',
  aadhaar: 'Aadhaar Number',
  credit_card: 'Credit Card',
};

export interface HighlightedTextProps {
  readonly segments: readonly HighlightSegment[];
  readonly tone: 'detected' | 'sanitized';
  readonly emptyText?: string;
  readonly className?: string;
}

function buildAccessibleMarkLabel(
  tone: 'detected' | 'sanitized',
  category?: PiiCategory,
): string {
  const categoryLabel = category
    ? CATEGORY_SINGULAR_LABELS[category]
    : 'Sensitive Identifier';
  return tone === 'detected'
    ? `Detected ${categoryLabel}`
    : `Sanitized ${categoryLabel}`;
}

export const HighlightedText = memo(function HighlightedText({
  segments,
  tone,
  emptyText = '',
  className,
}: HighlightedTextProps) {
  const containerClasses = [styles.container, className]
    .filter(Boolean)
    .join(' ');

  if (segments.length === 0) {
    return (
      <div className={containerClasses}>
        {emptyText && <span className={styles.empty}>{emptyText}</span>}
      </div>
    );
  }

  const markClass =
    tone === 'detected' ? styles.markDetected : styles.markSanitized;

  return (
    <div className={containerClasses}>
      {segments.map((segment, index) => {
        if (!segment.highlighted) {
          return <span key={`plain_${index}`}>{segment.text}</span>;
        }

        const label = buildAccessibleMarkLabel(tone, segment.category);
        return (
          <mark
            key={segment.entityId ?? `mark_${index}`}
            className={markClass}
            title={label}
            aria-label={label}
          >
            {segment.text}
          </mark>
        );
      })}
    </div>
  );
});
