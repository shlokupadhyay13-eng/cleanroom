import { Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '../ui/Badge';
import styles from './AppHeader.module.css';

export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.logoMark} aria-hidden="true">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>CLEANROOM</h1>
            <p className={styles.subtitle}>Local PII Sanitization Utility</p>
          </div>
        </div>

        <Badge variant="primary" className={styles.privacyBadge}>
          <Lock size={12} strokeWidth={2} aria-hidden="true" />
          <span>Client-Side Only — No Data Leaves Browser</span>
        </Badge>
      </div>
    </header>
  );
}
