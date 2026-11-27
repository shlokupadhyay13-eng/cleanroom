import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RedactionMode } from '../../types/ui';
import { ModeSelector } from './ModeSelector';

function ModeSelectorHarness({
  initialMode = 'full',
  onSelect,
}: {
  initialMode?: RedactionMode;
  onSelect?: (mode: RedactionMode) => void;
}) {
  const [mode, setMode] = useState<RedactionMode>(initialMode);

  return (
    <ModeSelector
      value={mode}
      onChange={(nextMode) => {
        setMode(nextMode);
        onSelect?.(nextMode);
      }}
    />
  );
}

describe('ModeSelector', () => {
  it('renders all three redaction modes with the active radio selected', () => {
    render(<ModeSelectorHarness initialMode="full" />);

    expect(
      screen.getByRole('radiogroup', { name: 'Redaction Mode' }),
    ).toBeInTheDocument();

    const fullRadio = screen.getByRole('radio', { name: 'Full Masking' });
    const partialRadio = screen.getByRole('radio', { name: 'Partial Masking' });
    const pseudonymizeRadio = screen.getByRole('radio', {
      name: 'Consistent Pseudonymization',
    });

    expect(fullRadio).toBeChecked();
    expect(partialRadio).not.toBeChecked();
    expect(pseudonymizeRadio).not.toBeChecked();
  });

  it('updates the active radio state when switching between modes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<ModeSelectorHarness initialMode="full" onSelect={onSelect} />);

    const fullRadio = screen.getByRole('radio', { name: 'Full Masking' });
    const partialRadio = screen.getByRole('radio', { name: 'Partial Masking' });
    const pseudonymizeRadio = screen.getByRole('radio', {
      name: 'Consistent Pseudonymization',
    });

    await user.click(partialRadio);
    expect(onSelect).toHaveBeenLastCalledWith('partial');
    expect(partialRadio).toBeChecked();
    expect(fullRadio).not.toBeChecked();

    await user.click(pseudonymizeRadio);
    expect(onSelect).toHaveBeenLastCalledWith('pseudonymize');
    expect(pseudonymizeRadio).toBeChecked();
    expect(partialRadio).not.toBeChecked();

    await user.click(fullRadio);
    expect(onSelect).toHaveBeenLastCalledWith('full');
    expect(fullRadio).toBeChecked();
  });
});
