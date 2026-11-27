import type { DetectionResult } from '../types/detection';
import type {
  PseudonymSession,
  RedactedEntity,
  RedactionOptions,
  RedactionResult,
} from '../types/redaction';
import { createEmptyCategoryCounts } from '../types/ui';
import { detectPii } from './detectPii';
import { applyFullMask, applyPartialMask } from './masking';
import { createPseudonymSession } from './pseudonymSession';

function resolveReplacement(
  category: DetectionResult['entities'][number]['category'],
  value: string,
  options: RedactionOptions,
  session: PseudonymSession | null,
): string {
  switch (options.mode) {
    case 'full':
      return applyFullMask();
    case 'partial':
      return applyPartialMask(category, value);
    case 'pseudonymize': {
      const activeSession = session ?? createPseudonymSession();
      return activeSession.getOrCreatePlaceholder(category, value);
    }
  }
}

export function redactDetectedEntities(
  text: string,
  detection: DetectionResult,
  options: RedactionOptions,
): RedactionResult {
  if (detection.entities.length === 0) {
    return {
      sanitizedText: text,
      mode: options.mode,
      entities: [],
      countsByCategory: createEmptyCategoryCounts(),
      totalDetected: 0,
      totalSanitized: 0,
    };
  }

  const ordered = [...detection.entities].sort((a, b) => a.start - b.start);
  const activeSession =
    options.mode === 'pseudonymize'
      ? (options.pseudonymSession ?? createPseudonymSession())
      : null;

  const chunks: string[] = [];
  const redactedEntities: RedactedEntity[] = [];
  const countsByCategory = createEmptyCategoryCounts();

  let sourceCursor = 0;
  let sanitizedCursor = 0;

  for (const entity of ordered) {
    if (
      entity.start < sourceCursor ||
      entity.end < entity.start ||
      entity.end > text.length
    ) {
      throw new Error(
        `Invalid or overlapping entity span [${entity.start}, ${entity.end}] for ${entity.id}.`,
      );
    }

    const unchangedPrefix = text.slice(sourceCursor, entity.start);
    if (unchangedPrefix.length > 0) {
      chunks.push(unchangedPrefix);
      sanitizedCursor += unchangedPrefix.length;
    }

    const replacement = resolveReplacement(
      entity.category,
      entity.value,
      options,
      activeSession,
    );

    const sanitizedStart = sanitizedCursor;
    chunks.push(replacement);
    sanitizedCursor += replacement.length;
    const sanitizedEnd = sanitizedCursor;

    redactedEntities.push({
      id: entity.id,
      category: entity.category,
      originalStart: entity.start,
      originalEnd: entity.end,
      sanitizedStart,
      sanitizedEnd,
      replacement,
      validationMethod: entity.validationMethod,
    });

    countsByCategory[entity.category] += 1;
    sourceCursor = entity.end;
  }

  const trailingText = text.slice(sourceCursor);
  if (trailingText.length > 0) {
    chunks.push(trailingText);
  }

  return {
    sanitizedText: chunks.join(''),
    mode: options.mode,
    entities: redactedEntities,
    countsByCategory,
    totalDetected: detection.totalCount,
    totalSanitized: redactedEntities.length,
  };
}

export function sanitizeText(
  text: string,
  options: RedactionOptions,
): { detection: DetectionResult; redaction: RedactionResult } {
  const detection = detectPii(
    text,
    options.enabledCategories !== undefined
      ? { enabledCategories: options.enabledCategories }
      : undefined,
  );
  const redaction = redactDetectedEntities(text, detection, options);
  return { detection, redaction };
}
