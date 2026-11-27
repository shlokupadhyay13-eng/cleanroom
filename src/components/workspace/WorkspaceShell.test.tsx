import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PII_CATEGORIES } from '../../types/ui';
import { WorkspaceShell } from './WorkspaceShell';

describe('WorkspaceShell UI & UX refinements', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports selective category toggling, zero-category guard, Enable All, and preserving toggles on Clear', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    const categoryGroup = screen.getByRole('group', {
      name: 'Active PII detection categories',
    });
    const emailChip = within(categoryGroup).getByRole('button', {
      name: /Email Addresses/i,
    });
    const panChip = within(categoryGroup).getByRole('button', {
      name: /PAN Numbers/i,
    });

    expect(emailChip).toHaveAttribute('aria-pressed', 'true');
    expect(panChip).toHaveAttribute('aria-pressed', 'true');

    const sourceInput = screen.getByLabelText(
      'Source text for PII sanitization',
    );
    await user.type(
      sourceInput,
      'Email alice@example.com and PAN ABCPE1234F',
    );

    // Disable Email Addresses while keeping PAN Numbers enabled
    await user.click(emailChip);
    expect(emailChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const sanitizedRegion = await screen.findByRole('region', {
      name: 'Sanitized Output',
    });
    expect(sanitizedRegion).toHaveTextContent('alice@example.com');
    expect(sanitizedRegion).not.toHaveTextContent('ABCPE1234F');
    expect(sanitizedRegion).toHaveTextContent('[REDACTED]');

    // Disable all remaining categories
    for (const category of PII_CATEGORIES) {
      const chip = within(categoryGroup).getByRole('button', {
        name: new RegExp(category.label, 'i'),
      });
      if (chip.getAttribute('aria-pressed') === 'true') {
        await user.click(chip);
      }
    }

    expect(screen.getByRole('button', { name: 'Sanitize' })).toBeDisabled();
    expect(
      screen.getByText('Enable at least one PII category to sanitize.'),
    ).toBeInTheDocument();

    // Clear resets text/output while preserving selected category filters
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(emailChip).toHaveAttribute('aria-pressed', 'false');

    // Enable All restores all 6 categories
    const enableAllButton = within(categoryGroup).getByRole('button', {
      name: 'Enable All',
    });
    await user.click(enableAllButton);

    for (const category of PII_CATEGORIES) {
      const chip = within(categoryGroup).getByRole('button', {
        name: new RegExp(category.label, 'i'),
      });
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    }
    expect(
      within(categoryGroup).queryByRole('button', { name: 'Enable All' }),
    ).not.toBeInTheDocument();
  });

  it('loads and sanitizes Sample CSV into structured CSV comparison tables', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    await user.click(screen.getByRole('button', { name: 'Sample CSV' }));

    expect(screen.getByText('sample-records.csv (CSV)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));

    const tables = await screen.findAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(screen.getByText('Output: Ready (CSV)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('handles drag-and-drop for valid .txt files and rejects unsupported .pdf drops with an alert', async () => {
    render(<WorkspaceShell />);

    const sourceInput = screen.getByLabelText(
      'Source text for PII sanitization',
    );
    const validFile = new File(
      ['Contact ops@example.com on 9876543210'],
      'notes.txt',
      { type: 'text/plain' },
    );

    fireEvent.dragEnter(sourceInput, {
      dataTransfer: { files: [validFile] },
    });
    expect(
      screen.getByText('Drop a .txt or .csv file to load locally'),
    ).toBeInTheDocument();

    fireEvent.drop(sourceInput, {
      dataTransfer: { files: [validFile] },
    });

    expect(await screen.findByText('notes.txt (TXT)')).toBeInTheDocument();
    expect(sourceInput).toHaveValue('Contact ops@example.com on 9876543210');

    const invalidFile = new File(['%PDF-1.4'], 'document.pdf', {
      type: 'application/pdf',
    });

    fireEvent.drop(sourceInput, {
      dataTransfer: { files: [invalidFile] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('updates live character and line counts and resets pane footers on Clear', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    expect(screen.getByText('0 chars · 0 lines')).toBeInTheDocument();
    expect(
      screen.getByText('Output: Awaiting sanitization'),
    ).toBeInTheDocument();

    const sourceInput = screen.getByLabelText(
      'Source text for PII sanitization',
    );
    await user.type(sourceInput, 'Line 1\nops@example.com');

    expect(screen.getByText('22 chars · 2 lines')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sanitize' }));
    expect(screen.getByText('Output: Ready (TXT)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 chars · 0 lines')).toBeInTheDocument();
    expect(
      screen.getByText('Output: Awaiting sanitization'),
    ).toBeInTheDocument();
  });
});
