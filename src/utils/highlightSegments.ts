import type { DetectedEntity } from '../types/detection';
import type { RedactedEntity } from '../types/redaction';
import type { PiiCategory } from '../types/ui';

export interface HighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
  readonly category?: PiiCategory;
  readonly entityId?: string;
  readonly validationMethod?: string;
}

interface SpanDescriptor {
  readonly start: number;
  readonly end: number;
  readonly category: PiiCategory;
  readonly entityId: string;
  readonly validationMethod: string;
}

function buildSegmentsFromSpans(
  text: string,
  spans: readonly SpanDescriptor[],
): HighlightSegment[] {
  if (text.length === 0) {
    return [];
  }

  if (spans.length === 0) {
    return [{ text, highlighted: false }];
  }

  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const span of ordered) {
    const start = Math.max(cursor, Math.min(span.start, text.length));
    const end = Math.max(start, Math.min(span.end, text.length));

    if (start > cursor) {
      segments.push({
        text: text.slice(cursor, start),
        highlighted: false,
      });
    }

    if (end > start) {
      segments.push({
        text: text.slice(start, end),
        highlighted: true,
        category: span.category,
        entityId: span.entityId,
        validationMethod: span.validationMethod,
      });
    }

    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      highlighted: false,
    });
  }

  return segments;
}

export function buildDetectedSegments(
  sourceText: string,
  entities: readonly DetectedEntity[],
): HighlightSegment[] {
  return buildSegmentsFromSpans(
    sourceText,
    entities.map((entity) => ({
      start: entity.start,
      end: entity.end,
      category: entity.category,
      entityId: entity.id,
      validationMethod: entity.validationMethod,
    })),
  );
}

export function buildSanitizedSegments(
  sanitizedText: string,
  entities: readonly RedactedEntity[],
): HighlightSegment[] {
  return buildSegmentsFromSpans(
    sanitizedText,
    entities.map((entity) => ({
      start: entity.sanitizedStart,
      end: entity.sanitizedEnd,
      category: entity.category,
      entityId: entity.id,
      validationMethod: entity.validationMethod,
    })),
  );
}
