import type {
  FileLoadResult,
  FileValidationResult,
  SupportedFileFormat,
} from '../types/file';
import { parseCsvSafely } from './csvProcessor';
import { stripUtf8Bom } from './textNormalization';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_INPUT_LENGTH = 5_000_000;
export const ACCEPTED_FILE_EXTENSIONS = ['.txt', '.csv'] as const;

export { stripUtf8Bom };

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
]);

function getFormatFromExtension(fileName: string): SupportedFileFormat | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.txt')) {
    return 'txt';
  }
  if (lowerName.endsWith('.csv')) {
    return 'csv';
  }
  return null;
}

function isAllowedMimeType(mimeType: string): boolean {
  if (mimeType.length === 0) {
    return true;
  }

  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalized.length === 0) {
    return true;
  }

  return normalized.startsWith('text/') || ALLOWED_MIME_TYPES.has(normalized);
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('File content is not readable as text.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file content locally.'));
    };
    reader.readAsText(file);
  });
}

/**
 * Checks local file extension, non-empty size bounds (<= 5 MB), and declared
 * MIME type before reading any file bytes into browser memory.
 */
export function validateFile(file: File): FileValidationResult {
  const format = getFormatFromExtension(file.name);
  if (!format) {
    return {
      ok: false,
      error: 'Unsupported file type. Please select a .txt or .csv file.',
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: 'The selected file is empty.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error:
        'The selected file exceeds the 5 MB client-side processing limit.',
    };
  }

  if (!isAllowedMimeType(file.type)) {
    return {
      ok: false,
      error: 'Unsupported file media type. Only plain text and CSV files are accepted.',
    };
  }

  return { ok: true, format };
}

/**
 * Validates and reads a local .txt or .csv File entirely in browser memory,
 * rejecting binary null bytes, character overruns, empty files, and malformed CSVs.
 */
export async function readLocalFile(file: File): Promise<FileLoadResult> {
  const validation = validateFile(file);
  if (!validation.ok) {
    return validation;
  }

  let rawContent: string;
  try {
    rawContent = await readFileAsText(file);
  } catch {
    return {
      ok: false,
      error: 'Unable to read the selected file locally.',
    };
  }

  const content = stripUtf8Bom(rawContent);

  if (content.includes('\u0000')) {
    return {
      ok: false,
      error:
        'The selected file appears to contain binary data and cannot be processed as text.',
    };
  }

  if (content.length > MAX_TEXT_INPUT_LENGTH) {
    return {
      ok: false,
      error:
        'The selected file exceeds the 5,000,000 character browser processing limit.',
    };
  }

  if (content.trim().length === 0) {
    return {
      ok: false,
      error: 'The selected file contains no text content.',
    };
  }

  if (validation.format === 'csv') {
    const csvCheck = parseCsvSafely(content);
    if (!csvCheck.ok) {
      return {
        ok: false,
        error: csvCheck.error,
      };
    }
  }

  return {
    ok: true,
    content,
    meta: {
      name: file.name,
      format: validation.format,
      sizeBytes: file.size,
    },
  };
}
