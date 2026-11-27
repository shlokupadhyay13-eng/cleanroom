import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('clipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns an error when attempting to copy empty text', async () => {
    const result = await copyTextToClipboard('');
    expect(result).toEqual({
      ok: false,
      error: 'There is no sanitized output to copy.',
    });
  });

  it('copies text using navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const result = await copyTextToClipboard('[REDACTED]');
    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('[REDACTED]');
  });

  it('handles rejected clipboard permissions and missing Clipboard API gracefully', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const rejectedResult = await copyTextToClipboard('Sensitive [REDACTED]');
    expect(rejectedResult.ok).toBe(false);
    if (!rejectedResult.ok) {
      expect(rejectedResult.error).not.toContain('Sensitive');
    }

    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const unavailableResult = await copyTextToClipboard('[REDACTED]');
    expect(unavailableResult.ok).toBe(false);
  });
});
