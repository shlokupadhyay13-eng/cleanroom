import type { DetectedEntity, DetectionResult, RawCandidate } from '../types/detection';
import { createEmptyCategoryCounts, type PiiCategory } from '../types/ui';
import { resolveOverlaps } from './overlapResolver';
import { DETECTOR_RULES } from './patterns';
import { validateCandidate } from './validators';

export interface DetectPiiOptions {
  readonly enabledCategories?: ReadonlySet<PiiCategory>;
}

interface ValidatedCandidate extends RawCandidate {
  readonly validationMethod: string;
}

export function detectPii(
  text: string,
  options?: DetectPiiOptions,
): DetectionResult {
  const enabledCategories = options?.enabledCategories;
  if (
    text.trim().length === 0 ||
    (enabledCategories !== undefined && enabledCategories.size === 0)
  ) {
    return {
      entities: [],
      countsByCategory: createEmptyCategoryCounts(),
      totalCount: 0,
    };
  }

  const activeRules =
    enabledCategories !== undefined
      ? DETECTOR_RULES.filter((rule) => enabledCategories.has(rule.category))
      : DETECTOR_RULES;

  const rawCandidates: RawCandidate[] = [];
  for (const rule of activeRules) {
    rawCandidates.push(...rule.detect(text));
  }

  // Validate candidates prior to overlap resolution so invalid longer tokens
  // cannot mask valid overlapping entities or produce false positives.
  const validatedCandidates: ValidatedCandidate[] = [];
  for (const candidate of rawCandidates) {
    const validation = validateCandidate(candidate.category, candidate.value);
    if (validation.isValid) {
      validatedCandidates.push({
        ...candidate,
        validationMethod: validation.method,
      });
    }
  }

  const resolved = resolveOverlaps(validatedCandidates);
  const countsByCategory = createEmptyCategoryCounts();
  const entities: DetectedEntity[] = [];

  for (let index = 0; index < resolved.length; index += 1) {
    const candidate = resolved[index];
    if (!candidate) {
      continue;
    }

    const slice = text.slice(candidate.start, candidate.end);
    if (slice !== candidate.value) {
      throw new Error(
        `Offset invariant violated for ${candidate.category} at [${candidate.start}, ${candidate.end}].`,
      );
    }

    entities.push({
      id: `entity_${index + 1}`,
      category: candidate.category,
      value: candidate.value,
      start: candidate.start,
      end: candidate.end,
      validationMethod: candidate.validationMethod,
    });

    countsByCategory[candidate.category] += 1;
  }

  return {
    entities,
    countsByCategory,
    totalCount: entities.length,
  };
}
