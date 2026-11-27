import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../engine';
import {
  buildBoundedDetectedSegments,
  buildBoundedSanitizedSegments,
  buildDetectedSegments,
  buildSanitizedSegments,
  sliceBoundedText,
} from './highlightSegments';

describe('highlightSegments', () => {
  it('reconstructs empty and zero-match inputs verbatim without highlights', () => {
    expect(buildDetectedSegments('', [])).toEqual([]);
    expect(buildSanitizedSegments('', [])).toEqual([]);

    expect(buildDetectedSegments('Clean text only.', [])).toEqual([
      { text: 'Clean text only.', highlighted: false },
    ]);
    expect(buildSanitizedSegments('Clean text only.', [])).toEqual([
      { text: 'Clean text only.', highlighted: false },
    ]);
  });

  it('reconstructs source and sanitized strings verbatim and tags only entity spans', () => {
    const source =
      'User <script>alert(1)</script> "alice@example.com" & PAN ABCPE1234F.';
    const { detection, redaction } = sanitizeText(source, { mode: 'partial' });

    const detectedSegments = buildDetectedSegments(source, detection.entities);
    expect(detectedSegments.map((s) => s.text).join('')).toBe(source);

    const detectedMarks = detectedSegments.filter((s) => s.highlighted);
    expect(detectedMarks).toHaveLength(2);
    expect(detectedMarks[0]).toMatchObject({
      text: 'alice@example.com',
      highlighted: true,
      category: 'email',
    });
    expect(detectedMarks[1]).toMatchObject({
      text: 'ABCPE1234F',
      highlighted: true,
      category: 'pan',
    });

    const sanitizedSegments = buildSanitizedSegments(
      redaction.sanitizedText,
      redaction.entities,
    );
    expect(sanitizedSegments.map((s) => s.text).join('')).toBe(
      redaction.sanitizedText,
    );

    const sanitizedMarks = sanitizedSegments.filter((s) => s.highlighted);
    expect(sanitizedMarks).toHaveLength(2);
    expect(sanitizedMarks[0]).toMatchObject({
      text: 'a***@example.com',
      highlighted: true,
      category: 'email',
    });
    expect(sanitizedMarks[1]).toMatchObject({
      text: 'ABXXXXXX4F',
      highlighted: true,
      category: 'pan',
    });
  });

  it('handles adjacent entities without losing characters', () => {
    const source = 'a@b.co,ABCPE1234F';
    const { detection, redaction } = sanitizeText(source, { mode: 'full' });

    const detected = buildDetectedSegments(source, detection.entities);
    expect(detected.map((s) => s.text).join('')).toBe(source);
    expect(detected.filter((s) => s.highlighted)).toHaveLength(2);

    const sanitized = buildSanitizedSegments(
      redaction.sanitizedText,
      redaction.entities,
    );
    expect(sanitized.map((s) => s.text).join('')).toBe('[REDACTED],[REDACTED]');
    expect(sanitized.filter((s) => s.highlighted)).toHaveLength(2);
  });

  it('caps text and highlight segments safely at maxChars boundaries', () => {
    const source = 'alice@example.com tail bob@example.com';
    const { detection, redaction } = sanitizeText(source, { mode: 'full' });

    expect(sliceBoundedText(source, 20)).toBe('alice@example.com ta');
    expect(sliceBoundedText('short', 20)).toBe('short');

    const boundedDetected = buildBoundedDetectedSegments(
      source,
      detection.entities,
      20,
    );
    expect(boundedDetected.map((s) => s.text).join('')).toBe(
      'alice@example.com ta',
    );
    expect(boundedDetected.filter((s) => s.highlighted)).toHaveLength(1);

    const boundedSanitized = buildBoundedSanitizedSegments(
      redaction.sanitizedText,
      redaction.entities,
      15,
    );
    expect(boundedSanitized.map((s) => s.text).join('')).toBe(
      '[REDACTED] tail',
    );
    expect(boundedSanitized.filter((s) => s.highlighted)).toHaveLength(1);
  });
});
