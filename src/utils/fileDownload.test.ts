import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSanitizedFilename,
  downloadSanitizedText,
} from './fileDownload';

describe('fileDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds sanitized filenames for uploaded files, pasted text, and unsafe characters', () => {
    expect(buildSanitizedFilename('customer_export.csv', 'csv')).toBe(
      'customer_export-sanitized.csv',
    );
    expect(buildSanitizedFilename('notes.TXT', 'txt')).toBe(
      'notes-sanitized.txt',
    );
    expect(buildSanitizedFilename(null, 'txt')).toBe(
      'cleanroom-sanitized.txt',
    );
    expect(buildSanitizedFilename('C:\\temp\\my report (final).csv', 'csv')).toBe(
      'my_report__final-sanitized.csv',
    );
  });

  it('creates an Object URL, triggers download, removes the anchor, and revokes the Object URL', () => {
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:cleanroom-test-url');
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const result = downloadSanitizedText(
      'name,email\nAlice,[REDACTED]',
      'csv',
      'contacts.csv',
    );

    expect(result).toEqual({ filename: 'contacts-sanitized.csv' });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);

    const blobArg = createObjectUrlSpy.mock.calls[0]?.[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe('text/csv;charset=utf-8');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:cleanroom-test-url');
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
  });

  it('rejects empty download content', () => {
    expect(() => downloadSanitizedText('', 'txt')).toThrow(
      /empty sanitized output/i,
    );
  });
});
