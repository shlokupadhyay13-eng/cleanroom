import type { SupportedFileFormat } from '../types/file';

const MAX_BASE_FILENAME_LENGTH = 80;
const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function buildSanitizedFilename(
  sourceFileName: string | null,
  format: SupportedFileFormat,
): string {
  if (!sourceFileName || sourceFileName.trim().length === 0) {
    return `cleanroom-sanitized.${format}`;
  }

  const baseSegment = sourceFileName.trim().split(/[/\\]/).pop() ?? '';
  // Strip ASCII control characters before normalizing path/extension tokens.
  const withoutControlChars = Array.from(baseSegment)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');

  const withoutExtension = withoutControlChars.replace(/\.(txt|csv)$/i, '');
  const cleaned = withoutExtension
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  const capped = cleaned
    .slice(0, MAX_BASE_FILENAME_LENGTH)
    .replace(/^[._-]+|[._-]+$/g, '');

  const stemBeforeDot = capped.split('.')[0] ?? '';
  const isReserved =
    capped.length === 0 ||
    WINDOWS_RESERVED_NAMES.test(capped) ||
    WINDOWS_RESERVED_NAMES.test(stemBeforeDot);

  const finalBase = isReserved ? 'cleanroom' : capped;
  return `${finalBase}-sanitized.${format}`;
}

export function downloadSanitizedText(
  content: string,
  format: SupportedFileFormat,
  sourceFileName: string | null = null,
): { filename: string } {
  if (content.length === 0) {
    throw new Error('Cannot download empty sanitized output.');
  }

  const filename = buildSanitizedFilename(sourceFileName, format);
  const mimeType =
    format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener noreferrer';

    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return { filename };
}
