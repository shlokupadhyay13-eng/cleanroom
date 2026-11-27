import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createActivityEntry } from '../../utils';
import { ActivityLogPanel } from './ActivityLogPanel';

describe('ActivityLogPanel', () => {
  it('renders empty state with Clear Log disabled when entries are empty', () => {
    render(<ActivityLogPanel entries={[]} onClearLog={vi.fn()} />);

    expect(
      screen.getByText(
        /No processing activity yet\. Local logs record operations and settings only/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Log' })).toBeDisabled();
  });

  it('renders entries in order with metadata and triggers onClearLog when clicked', async () => {
    const user = userEvent.setup();
    const onClearLog = vi.fn();
    const entries = [
      createActivityEntry({
        action: 'copy',
        summary: 'Copied sanitized output to clipboard.',
        mode: 'partial',
        entityCount: 3,
        sourceFormat: 'text',
      }),
      createActivityEntry({
        action: 'sanitize',
        summary: 'Sanitized TEXT input using Partial Masking.',
        mode: 'partial',
        entityCount: 3,
        sourceFormat: 'text',
      }),
    ];

    render(<ActivityLogPanel entries={entries} onClearLog={onClearLog} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Copied sanitized output to clipboard.');
    expect(items[1]).toHaveTextContent(
      'Sanitized TEXT input using Partial Masking.',
    );

    const clearButton = screen.getByRole('button', { name: 'Clear Log' });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);
    expect(onClearLog).toHaveBeenCalledTimes(1);
  });
});
