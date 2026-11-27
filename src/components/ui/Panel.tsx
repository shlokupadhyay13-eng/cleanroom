import { useId, type ReactNode } from 'react';
import styles from './Panel.module.css';

export interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: PanelProps) {
  const headingId = useId();
  const hasHeader = Boolean(title || subtitle || actions);
  const classes = [styles.panel, className].filter(Boolean).join(' ');

  return (
    <section
      className={classes}
      aria-labelledby={title ? headingId : undefined}
    >
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            {title && (
              <h2 id={headingId} className={styles.title}>
                {title}
              </h2>
            )}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
