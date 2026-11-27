import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';

describe('Accessibility and keyboard ergonomics', () => {
  it('provides a skip link targeting the main workspace landmark', () => {
    render(<App />);

    const skipLink = screen.getByRole('link', {
      name: 'Skip to main workspace',
    });
    expect(skipLink).toHaveAttribute('href', '#main-workspace');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-workspace');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('triggers sanitization with Ctrl+Enter inside Source Input and exposes helper hint', async () => {
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    expect(textarea).toHaveAttribute('aria-describedby', 'source-input-hint');
    expect(
      screen.getByText(/Press Ctrl\+Enter \(or Cmd\+Enter\) to sanitize locally/i),
    ).toBeInTheDocument();

    await user.type(textarea, 'Email alice@example.com{Control>}{Enter}{/Control}');

    const outputRegion = screen.getByRole('region', {
      name: 'Sanitized Output',
    });
    expect(within(outputRegion).getByText('[REDACTED]')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Statistics' })).toHaveTextContent(
      'Total Detected: 1',
    );
  });

  it('sets aria-invalid on Source Input during errors and clears it when dismissed', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);

    const textarea = screen.getByLabelText('Source text for PII sanitization');
    expect(textarea).toHaveAttribute('aria-invalid', 'false');

    const fileInput = screen.getByLabelText('Upload .txt or .csv file');
    const badFile = new File(['%PDF-1.4'], 'bad.pdf', {
      type: 'application/pdf',
    });
    await user.upload(fileInput, badFile);

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(textarea).toHaveAttribute('aria-invalid', 'false');
  });
});
