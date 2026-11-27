import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PII_CATEGORIES } from './types/ui';
import * as fileDownloadModule from './utils/fileDownload';
import App from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders semantic landmarks, header, honest zero-state panels, and footer notice', () => {
    render(<App />);

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByRole('heading', { level: 1, name: 'CLEANROOM' }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText('Client-Side Only — No Data Leaves Browser'),
    ).toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();

    const statusRegion = within(main)
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('Status:'));
    expect(statusRegion).toHaveTextContent('Status: Idle');

    expect(
      within(main).getByRole('button', { name: 'Sanitize' }),
    ).toBeDisabled();
    expect(
      within(main).getByRole('button', { name: 'Upload File' }),
    ).toBeEnabled();
    expect(
      within(main).getByRole('button', { name: 'Load Sample' }),
    ).toBeEnabled();
    expect(within(main).getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(
      within(main).getByRole('button', { name: 'Download' }),
    ).toBeDisabled();

    expect(
      within(main).getByLabelText('Source text for PII sanitization'),
    ).toBeInTheDocument();
    expect(
      within(main).getByText(
        'Paste text, upload a .txt or .csv file, or load sample text, then click Sanitize.',
      ),
    ).toBeInTheDocument();

    const statsSection = within(main).getByRole('region', {
      name: 'Statistics',
    });
    expect(statsSection).toHaveTextContent('Total Detected: 0');
    expect(statsSection).toHaveTextContent('Sanitized: 0');

    for (const category of PII_CATEGORIES) {
      expect(within(statsSection).getByText(category.label)).toBeInTheDocument();
    }
    expect(within(statsSection).getAllByText('0').length).toBeGreaterThanOrEqual(
      PII_CATEGORIES.length + 2,
    );

    const logSection = within(main).getByRole('region', {
      name: 'Local Activity Log',
    });
    expect(
      within(logSection).getByText(
        /No processing activity yet\. Local logs record operations and settings only/i,
      ),
    ).toBeInTheDocument();

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByText(/does not protect against a compromised device/i),
    ).toBeInTheDocument();
  });

  it('enables Clear when source text is entered and resets input when clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    const clearButton = screen.getByRole('button', { name: 'Clear' });

    expect(clearButton).toBeDisabled();

    await user.type(textarea, 'Contact: jane.doe@example.com');
    expect(textarea).toHaveValue('Contact: jane.doe@example.com');
    expect(clearButton).toBeEnabled();

    await user.click(clearButton);
    expect(textarea).toHaveValue('');
    expect(clearButton).toBeDisabled();
  });

  it('loads a valid .txt file into Source Input and resets metadata on Clear', async () => {
    const user = userEvent.setup();
    render(<App />);

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const txtFile = new File(['Email: jane.doe@example.com'], 'sample.txt', {
      type: 'text/plain',
    });

    await user.upload(fileInput, txtFile);

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    expect(textarea).toHaveValue('Email: jane.doe@example.com');
    expect(screen.getByText('sample.txt (TXT)')).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: 'Clear' });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    expect(textarea).toHaveValue('');
    expect(screen.queryByText('sample.txt (TXT)')).not.toBeInTheDocument();
  });

  it('displays a dismissible error alert when a malformed CSV file is uploaded', async () => {
    const user = userEvent.setup();
    render(<App />);

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const malformedCsv = new File(
      ['name,email,phone\nAlice,alice@example.com'],
      'broken.csv',
      { type: 'text/csv' },
    );

    await user.upload(fileInput, malformedCsv);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/row 2/i);
    expect(alert).not.toHaveTextContent('alice@example.com');

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sanitizes multi-category text, live-updates on mode change, highlights comparison, downloads, and resets on Clear', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi
      .spyOn(fileDownloadModule, 'downloadSanitizedText')
      .mockReturnValue({ filename: 'cleanroom-sanitized.txt' });

    render(<App />);

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    const sanitizeButton = screen.getByRole('button', { name: 'Sanitize' });
    const downloadButton = screen.getByRole('button', { name: 'Download' });

    const noisySample =
      'Email john@example.com, Phone +91 98765 43210, IP 192.168.1.42, PAN ABCPE1234F, Card 4111-1111-1111-1111.';

    await user.type(textarea, noisySample);
    expect(sanitizeButton).toBeEnabled();

    await user.click(sanitizeButton);

    const statusBadge = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('Status:'));
    expect(statusBadge).toHaveTextContent(
      'Status: Ready — 5 entities sanitized',
    );
    expect(downloadButton).toBeEnabled();

    const outputRegion = screen.getByRole('region', {
      name: 'Sanitized Output',
    });
    expect(within(outputRegion).getAllByText('[REDACTED]')).toHaveLength(5);

    const statsSection = screen.getByRole('region', { name: 'Statistics' });
    expect(statsSection).toHaveTextContent('Total Detected: 5');
    expect(statsSection).toHaveTextContent('Sanitized: 5');

    const comparisonRegion = screen.getByRole('region', {
      name: 'Side-by-Side Comparison',
    });
    expect(within(comparisonRegion).getByText('john@example.com').tagName).toBe(
      'MARK',
    );
    expect(within(comparisonRegion).getByText('ABCPE1234F').tagName).toBe(
      'MARK',
    );

    await user.click(screen.getByRole('radio', { name: 'Partial Masking' }));
    expect(outputRegion).toHaveTextContent('j***@example.com');
    expect(outputRegion).toHaveTextContent('ABXXXXXX4F');
    expect(outputRegion).toHaveTextContent('192.XXX.XXX.XXX');
    expect(outputRegion).toHaveTextContent('XXXX-XXXX-XXXX-1111');

    await user.click(
      screen.getByRole('radio', { name: 'Consistent Pseudonymization' }),
    );
    expect(outputRegion).toHaveTextContent('[EMAIL_001]');
    expect(outputRegion).toHaveTextContent('[PHONE_001]');
    expect(outputRegion).toHaveTextContent('[IP_001]');
    expect(outputRegion).toHaveTextContent('[PAN_001]');
    expect(outputRegion).toHaveTextContent('[CARD_001]');

    await user.click(downloadButton);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('[EMAIL_001]'),
      'txt',
      null,
    );

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(textarea).toHaveValue('');
    expect(statusBadge).toHaveTextContent('Status: Idle');
    expect(downloadButton).toBeDisabled();
    expect(
      screen.queryByRole('region', { name: 'Side-by-Side Comparison' }),
    ).not.toBeInTheDocument();
    expect(statsSection).toHaveTextContent('Total Detected: 0');
    expect(statsSection).toHaveTextContent('Sanitized: 0');
  });

  it('executes full Load Sample -> Sanitize -> Copy -> Download -> Clear workflow with strictly PII-free Activity Log', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    vi.spyOn(fileDownloadModule, 'downloadSanitizedText').mockReturnValue({
      filename: 'cleanroom-sanitized.txt',
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Load Sample' }));
    const textarea = screen.getByLabelText('Source text for PII sanitization');
    expect((textarea as HTMLTextAreaElement).value).toContain(
      'Alex.Taylor@example.org',
    );

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const statsSection = screen.getByRole('region', { name: 'Statistics' });
    for (const category of PII_CATEGORIES) {
      const card = within(statsSection)
        .getByText(category.label)
        .closest('div');
      expect(card).not.toBeNull();
      const countText = card?.lastElementChild?.textContent ?? '0';
      expect(Number(countText)).toBeGreaterThanOrEqual(1);
    }

    const copyButton = screen.getByRole('button', { name: 'Copy' });
    await user.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedPayload = writeTextMock.mock.calls[0]?.[0] as string;
    expect(copiedPayload).not.toContain('Alex.Taylor@example.org');
    expect(copiedPayload).not.toContain('ABCPE1234F');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    const logSection = screen.getByRole('region', {
      name: 'Local Activity Log',
    });
    expect(within(logSection).getByText('Sample')).toBeInTheDocument();
    expect(within(logSection).getByText('Sanitize')).toBeInTheDocument();
    expect(within(logSection).getByText('Copy')).toBeInTheDocument();
    expect(within(logSection).getByText('Download')).toBeInTheDocument();
    expect(within(logSection).getByText('Clear')).toBeInTheDocument();

    const logText = logSection.textContent ?? '';
    expect(logText).not.toContain('Alex.Taylor@example.org');
    expect(logText).not.toContain('billing.support@sample-corp.net');
    expect(logText).not.toContain('98765');
    expect(logText).not.toContain('192.168.10.42');
    expect(logText).not.toContain('2001:db8::1');
    expect(logText).not.toContain('ABCPE1234F');
    expect(logText).not.toContain('4111-1111-1111-1111');
  });

  it('detaches CSV file mode when selecting all and pasting plain text', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Sample CSV' }));
    expect(screen.getByText('sample-records.csv (CSV)')).toBeInTheDocument();

    const textarea = screen.getByLabelText(
      'Source text for PII sanitization',
    ) as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, textarea.value.length);
    await user.paste('Contact john@example.com or card 4111-1111-1111-1111');

    expect(
      screen.queryByText('sample-records.csv (CSV)'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const outputRegion = await screen.findByRole('region', {
      name: 'Sanitized Output',
    });
    expect(within(outputRegion).getAllByText('[REDACTED]')).toHaveLength(2);
    expect(outputRegion).not.toHaveTextContent('john@example.com');
    expect(outputRegion).not.toHaveTextContent('4111-1111-1111-1111');
  });

  it('detaches CSV file mode when clicking the file badge detach button and re-runs as plain text', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Sample CSV' }));
    expect(screen.getByText('sample-records.csv (CSV)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    expect(await screen.findAllByRole('table')).toHaveLength(2);

    await user.click(
      screen.getByRole('button', {
        name: 'Detach file and treat input as plain text',
      }),
    );

    expect(
      screen.queryByText('sample-records.csv (CSV)'),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Output: Ready (TXT)')).toBeInTheDocument();
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });
});
