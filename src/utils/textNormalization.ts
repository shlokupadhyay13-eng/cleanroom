export interface TextMetrics {
  readonly chars: number;
  readonly lines: number;
}

/**
 * Strips a leading UTF-8 byte order mark (\uFEFF) so file headers and
 * first-character PII patterns parse consistently across local OS encoders.
 */
export function stripUtf8Bom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

/**
 * Computes character and line counts for live workspace status footers.
 */
export function computeTextMetrics(text: string): TextMetrics {
  if (text.length === 0) {
    return { chars: 0, lines: 0 };
  }
  return {
    chars: text.length,
    lines: text.split(/\r?\n/).length,
  };
}
