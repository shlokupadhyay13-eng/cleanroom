import Papa from 'papaparse';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type {
  WorkerSanitizeRequest,
  WorkerSanitizeResponse,
} from '../types/worker';
import { WORKER_THRESHOLD_CHARS } from '../utils';
import { handleWorkerRequest } from '../workers/sanitizationWorker';

describe('CLEANROOM end-to-end integration journeys', () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    Object.defineProperty(globalThis, 'Worker', {
      value: originalWorker,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('completes CSV upload -> sanitize across all 3 modes -> download Blob -> PapaParse verification', async () => {
    const user = userEvent.setup();
    let capturedBlob: Blob | null = null;
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        capturedBlob = obj as Blob;
        return 'blob:cleanroom-integration-csv';
      });
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<App />);

    const rawCsv = [
      'id,customer,address,email,tax_pan,card,phone,ip',
      '1,"Patel, Rohan","Flat ""4B""\nMumbai",Rohan.Patel@example.org,ABCPE1234F,4111-1111-1111-1111,+91 98765 43210,192.168.1.42',
      '2,"Verma, Anita","Suite 12",rohan.patel@example.org,PQRCS9876K,5412345678901232,+1 (415) 555-0199,10.0.0.1',
    ].join('\n');

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const csvFile = new File([rawCsv], 'customers.csv', { type: 'text/csv' });

    await user.upload(fileInput, csvFile);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const stats = screen.getByRole('region', { name: 'Statistics' });
    expect(stats).toHaveTextContent('Total Detected: 10');
    expect(stats).toHaveTextContent('Sanitized: 10');

    const comparison = screen.getByRole('region', {
      name: 'Side-by-Side Comparison',
    });
    const tables = within(comparison).getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[0]!).getByText('customer')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Partial Masking' }));
    expect(within(tables[1]!).getByText('R***@example.org')).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: 'Consistent Pseudonymization' }),
    );
    expect(within(tables[1]!).getAllByText('[EMAIL_001]')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(
      'blob:cleanroom-integration-csv',
    );
    expect(capturedBlob).not.toBeNull();

    const downloadedText = await capturedBlob!.text();
    const reparsed = Papa.parse<string[]>(downloadedText, {
      header: false,
      skipEmptyLines: false,
    });

    expect(reparsed.errors).toEqual([]);
    expect(reparsed.data).toHaveLength(3);
    expect(reparsed.data[0]).toEqual([
      'id',
      'customer',
      'address',
      'email',
      'tax_pan',
      'card',
      'phone',
      'ip',
    ]);
    expect(reparsed.data[1]?.[1]).toBe('Patel, Rohan');
    expect(reparsed.data[1]?.[2]).toBe('Flat "4B"\nMumbai');
    expect(reparsed.data[1]?.[3]).toBe('[EMAIL_001]');
    expect(reparsed.data[2]?.[3]).toBe('[EMAIL_001]');

    expect(downloadedText).not.toContain('Rohan.Patel@example.org');
    expect(downloadedText).not.toContain('ABCPE1234F');
    expect(downloadedText).not.toContain('4111-1111-1111-1111');
    expect(downloadedText).not.toContain('98765');
    expect(downloadedText).not.toContain('192.168.1.42');
  });

  it('recovers cleanly when an uploaded CSV is edited into invalid syntax and then fixed', async () => {
    const user = userEvent.setup();
    render(<App />);

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const validCsv = new File(
      ['name,email\nAlice,alice@example.org'],
      'team.csv',
      { type: 'text/csv' },
    );
    await user.upload(fileInput, validCsv);

    const textarea = screen.getByLabelText(
      'Source text for PII sanitization',
    ) as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(11, 11);
    await user.keyboard('"');
    expect(textarea).toHaveValue('name,email\n"Alice,alice@example.org');
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/malformed csv/i);
    expect(alert).not.toHaveTextContent('alice@example.org');

    await user.click(textarea);
    textarea.setSelectionRange(12, 12);
    await user.keyboard('{Backspace}');
    expect(textarea).toHaveValue('name,email\nAlice,alice@example.org');
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Sanitized Output' }),
    ).toHaveTextContent('name,email Alice,[REDACTED]');
  });

  it('handles zero-match prose cleanly with verbatim Copy and Download', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    const downloadSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:cleanroom-zero');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<App />);

    const cleanProse =
      'Quarterly review scheduled for 2026-11-27 on release v2.4.1.0 with 42 items.';
    const textarea = screen.getByLabelText('Source text for PII sanitization');
    await user.click(textarea);
    await user.paste(cleanProse);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const statusBadge = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('Status:'));
    expect(statusBadge).toHaveTextContent('Status: Ready — No PII detected');

    const stats = screen.getByRole('region', { name: 'Statistics' });
    expect(stats).toHaveTextContent('Total Detected: 0');
    expect(stats).toHaveTextContent('Sanitized: 0');

    const outputRegion = screen.getByRole('region', {
      name: 'Sanitized Output',
    });
    expect(outputRegion).toHaveTextContent(
      'Processed locally — no supported PII patterns were detected.',
    );
    expect(outputRegion).toHaveTextContent(cleanProse);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeTextMock).toHaveBeenCalledWith(cleanProse);

    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });

  it('discards stale async worker results when Clear is clicked before completion', async () => {
    let pendingMessage: WorkerSanitizeRequest | null = null;
    const listeners = new Set<
      (event: MessageEvent<WorkerSanitizeResponse>) => void
    >();

    class DeferredMockWorker {
      addEventListener(
        type: string,
        listener: (event: MessageEvent<WorkerSanitizeResponse>) => void,
      ): void {
        if (type === 'message') {
          listeners.add(listener);
        }
      }
      removeEventListener(): void {}
      postMessage(message: WorkerSanitizeRequest): void {
        if (message.type !== 'clear-session') {
          pendingMessage = message;
        }
      }
      terminate(): void {}
    }

    vi.stubGlobal('Worker', DeferredMockWorker);
    const user = userEvent.setup();
    render(<App />);

    const largePayload = `Email alice@example.com ${'a'.repeat(WORKER_THRESHOLD_CHARS)}`;
    const textarea = screen.getByLabelText('Source text for PII sanitization');
    await user.click(textarea);
    await user.paste(largePayload);
    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    expect(pendingMessage).not.toBeNull();

    // Clear while worker request is still in flight.
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    // Now emit the late worker response.
    const previousPost = globalThis.postMessage;
    Object.defineProperty(globalThis, 'postMessage', {
      value: (response: WorkerSanitizeResponse) => {
        for (const listener of listeners) {
          listener({ data: response } as MessageEvent<WorkerSanitizeResponse>);
        }
      },
      configurable: true,
    });
    try {
      handleWorkerRequest(pendingMessage!);
    } finally {
      Object.defineProperty(globalThis, 'postMessage', {
        value: previousPost,
        configurable: true,
      });
    }

    const statusBadge = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('Status:'));
    expect(statusBadge).toHaveTextContent('Status: Idle');
    expect(
      screen.getByRole('region', { name: 'Statistics' }),
    ).toHaveTextContent('Total Detected: 0');
  });
});
