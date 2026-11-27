import { AppHeader } from './components/layout/AppHeader';
import { WorkspaceShell } from './components/workspace/WorkspaceShell';
import styles from './App.module.css';

export default function App() {
  return (
    <div className={styles.app}>
      <a href="#main-workspace" className={styles.skipLink}>
        Skip to main workspace
      </a>
      <AppHeader />
      <main id="main-workspace" tabIndex={-1} className={styles.main}>
        <WorkspaceShell />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerText}>
            All processing executes locally in your browser. Client-side
            execution does not protect against a compromised device, browser
            extension, or operating system.
          </p>
          <details className={styles.privacyDetails}>
            <summary className={styles.privacySummary}>
              Privacy &amp; Security Scope
            </summary>
            <dl className={styles.privacyList}>
              <div className={styles.privacyItem}>
                <dt>Local Execution</dt>
                <dd>
                  Detection, validation, redaction, CSV parsing, and activity
                  logging run locally inside the browser; no document text is
                  transmitted to external servers, APIs, or telemetry endpoints.
                </dd>
              </div>
              <div className={styles.privacyItem}>
                <dt>Ephemeral State</dt>
                <dd>
                  Raw input, sanitized output, and pseudonymization mappings stay
                  in volatile page memory only (not written to browser local
                  storage, session storage, or cookies) and are cleared when you
                  click Clear or close the tab.
                </dd>
              </div>
              <div className={styles.privacyItem}>
                <dt>Validation Boundaries</dt>
                <dd>
                  Checksum and pattern checks verify structural format
                  only—never identity, document authenticity, or payment card
                  status.
                </dd>
              </div>
              <div className={styles.privacyItem}>
                <dt>Threat-Model Limits</dt>
                <dd>
                  Browser-side processing cannot protect against a compromised
                  device, malicious browser extensions, screen-capture tools, OS
                  clipboard managers, or operating-system compromise.
                </dd>
              </div>
            </dl>
          </details>
        </div>
      </footer>
    </div>
  );
}
