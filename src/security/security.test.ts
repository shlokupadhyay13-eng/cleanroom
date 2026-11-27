import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import {
  MAX_TEXT_INPUT_LENGTH,
  buildSanitizedFilename,
  createActivityEntry,
  downloadSanitizedText,
  parseCsvSafely,
  readLocalFile,
  sanitizeCsvText,
  sanitizeLogSummary,
} from '../utils';
import * as fileDownloadModule from '../utils/fileDownload';

function buildVerhoeffAadhaar(baseElevenDigits: string): string {
  const d: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  let c = 0;
  for (let i = 0; i < baseElevenDigits.length; i += 1) {
    const digit = baseElevenDigits.charCodeAt(baseElevenDigits.length - 1 - i) - 48;
    const permuted = p[(i + 1) % 8]?.[digit] ?? 0;
    c = d[c]?.[permuted] ?? 0;
  }

  return `${baseElevenDigits}${inv[c] ?? 0}`;
}

describe('CLEANROOM security and privacy invariants', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('performs zero network requests and zero persistent storage writes across full text and CSV workflows', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network disabled in CLEANROOM'));
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');

    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    vi.spyOn(fileDownloadModule, 'downloadSanitizedText').mockReturnValue({
      filename: 'cleanroom-sanitized.txt',
    });

    render(createElement(App));

    await user.click(screen.getByRole('button', { name: 'Load Sample' }));
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    await user.click(screen.getByRole('radio', { name: 'Partial Masking' }));
    await user.click(
      screen.getByRole('radio', { name: 'Consistent Pseudonymization' }),
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const csvFile = new File(
      ['name,email\nAlice,alice@example.org\n'],
      'contacts.csv',
      { type: 'text/csv' },
    );
    await user.upload(fileInput, csvFile);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('neutralizes accidentally passed raw PII in activity logs while preserving operational summaries', () => {
    const aadhaar = buildVerhoeffAadhaar('23456789012');
    const normalSummary =
      'Sanitized CSV input using Consistent Pseudonymization (4 entities).';
    expect(sanitizeLogSummary(normalSummary)).toBe(normalSummary);

    const leaked = createActivityEntry({
      action: 'error',
      summary: `Failure near john@example.com, +91 98765 43210, 192.168.1.42, ABCPE1234F, 4111-1111-1111-1111, ${aadhaar}`,
    });

    expect(leaked.summary).not.toContain('john@example.com');
    expect(leaked.summary).not.toContain('98765');
    expect(leaked.summary).not.toContain('192.168.1.42');
    expect(leaked.summary).not.toContain('ABCPE1234F');
    expect(leaked.summary).not.toContain('4111-1111-1111-1111');
    expect(leaked.summary).not.toContain(aadhaar);
    expect(leaked.summary).toContain('[REDACTED]');
  });

  it('renders HTML and script payloads as escaped literal text without DOM injection', async () => {
    const user = userEvent.setup();
    const { container } = render(createElement(App));

    const payload =
      'Note <script>window.__xss=true</script> <img src=x onerror="window.__xss=true"> email alice@example.com.';
    const textarea = screen.getByLabelText('Source text for PII sanitization');
    await user.click(textarea);
    await user.paste(payload);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(0);

    const outputRegion = screen.getByRole('region', {
      name: 'Sanitized Output',
    });
    expect(outputRegion).toHaveTextContent('<script>window.__xss=true</script>');
    expect(outputRegion).toHaveTextContent(
      '<img src=x onerror="window.__xss=true">',
    );
  });

  it('hardens filenames against traversal, Windows reserved names, control characters, and excessive length', () => {
    expect(buildSanitizedFilename('../../secret/report.csv', 'csv')).toBe(
      'report-sanitized.csv',
    );
    expect(buildSanitizedFilename('CON.txt', 'txt')).toBe(
      'cleanroom-sanitized.txt',
    );
    expect(buildSanitizedFilename('nul.csv', 'csv')).toBe(
      'cleanroom-sanitized.csv',
    );
    expect(buildSanitizedFilename('COM1.backup.txt', 'txt')).toBe(
      'cleanroom-sanitized.txt',
    );
    expect(buildSanitizedFilename('bad\u0000name\u001f.txt', 'txt')).toBe(
      'badname-sanitized.txt',
    );

    const longName = `${'a'.repeat(120)}.csv`;
    const builtLong = buildSanitizedFilename(longName, 'csv');
    expect(builtLong.length).toBeLessThanOrEqual(80 + '-sanitized.csv'.length);
    expect(builtLong.endsWith('-sanitized.csv')).toBe(true);
  });

  it('strips UTF-8 BOMs on .txt/.csv reads and revokes Object URLs even if download click fails', async () => {
    const txtWithBom = new File(
      ['\uFEFFjohn@example.com'],
      'bom.txt',
      { type: 'text/plain' },
    );
    const txtResult = await readLocalFile(txtWithBom);
    expect(txtResult.ok).toBe(true);
    if (txtResult.ok) {
      expect(txtResult.content.startsWith('\uFEFF')).toBe(false);
      expect(txtResult.content).toBe('john@example.com');
    }

    const csvWithBom = '\uFEFFname,email\nAlice,alice@example.org\n';
    const parsedCsv = parseCsvSafely(csvWithBom);
    expect(parsedCsv.ok).toBe(true);
    if (parsedCsv.ok) {
      expect(parsedCsv.rows[0]?.[0]).toBe('name');
    }

    const sanitizedCsv = sanitizeCsvText(csvWithBom, { mode: 'full' });
    expect(sanitizedCsv.ok).toBe(true);
    if (sanitizedCsv.ok) {
      expect(sanitizedCsv.sanitizedCsv.startsWith('name,email')).toBe(true);
    }

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cleanroom-revoke');
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Blocked click');
    });

    expect(() =>
      downloadSanitizedText('sanitized', 'txt', 'sample.txt'),
    ).toThrow('Blocked click');
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:cleanroom-revoke');
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
  });

  it('resets pseudonymization session state on Clear, new file upload, and unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(createElement(App));

    await user.click(
      screen.getByRole('radio', { name: 'Consistent Pseudonymization' }),
    );
    const textarea = screen.getByLabelText('Source text for PII sanitization');
    await user.type(textarea, 'alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const outputRegion = screen.getByRole('region', {
      name: 'Sanitized Output',
    });
    expect(outputRegion).toHaveTextContent('[EMAIL_001]');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.type(textarea, 'bob@example.com');
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    expect(outputRegion).toHaveTextContent('[EMAIL_001]');

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const nextFile = new File(['carol@example.com'], 'next.txt', {
      type: 'text/plain',
    });
    await user.upload(fileInput, nextFile);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    expect(outputRegion).toHaveTextContent('[EMAIL_001]');

    unmount();

    render(createElement(App));
    const privacySummary = screen.getByText('Privacy & Security Scope');
    expect(privacySummary).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText(/Threat-Model Limits/)).toBeInTheDocument();
  });

  it('never calls navigator.sendBeacon, never leaks malformed CSV PII in alerts/logs, guards oversized paste, and clears log entries', async () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconMock,
      configurable: true,
    });

    const user = userEvent.setup();
    render(createElement(App));

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const leakyBrokenCsv = new File(
      ['name,email,pan\n"Alice,secret.person@example.com,ABCPE1234F'],
      'broken.csv',
      { type: 'text/csv' },
    );
    await user.upload(fileInput, leakyBrokenCsv);

    const csvAlert = screen.getByRole('alert');
    expect(csvAlert.textContent).not.toContain('secret.person@example.com');
    expect(csvAlert.textContent).not.toContain('ABCPE1234F');

    const logRegion = screen.getByRole('region', {
      name: 'Local Activity Log',
    });
    expect(logRegion.textContent).not.toContain('secret.person@example.com');
    expect(logRegion.textContent).not.toContain('ABCPE1234F');

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    const oversizedInput = `oversized.user@example.com ${'x'.repeat(MAX_TEXT_INPUT_LENGTH)}`;
    fireEvent.change(textarea, { target: { value: oversizedInput } });

    const limitAlert = screen.getByRole('alert');
    expect(limitAlert).toHaveTextContent(/5,000,000 character/i);
    expect(limitAlert.textContent).not.toContain('oversized.user@example.com');
    expect(logRegion.textContent).not.toContain('oversized.user@example.com');

    await user.click(within(logRegion).getByRole('button', { name: 'Clear Log' }));
    expect(
      within(logRegion).getByText(/No processing activity yet/i),
    ).toBeInTheDocument();
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });
});
