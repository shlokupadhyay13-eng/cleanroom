export type ClipboardCopyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * Copies sanitized output to the local clipboard using the browser Clipboard API.
 * Never includes copied text content in error messages.
 */
export async function copyTextToClipboard(
  text: string,
): Promise<ClipboardCopyResult> {
  if (text.length === 0) {
    return {
      ok: false,
      error: 'There is no sanitized output to copy.',
    };
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    return {
      ok: false,
      error:
        'Clipboard access is unavailable in this browser context. Use Download instead.',
    };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        'Clipboard access is unavailable in this browser context. Use Download instead.',
    };
  }
}
