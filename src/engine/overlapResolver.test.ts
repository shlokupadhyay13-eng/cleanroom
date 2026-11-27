import { describe, expect, it } from 'vitest';
import type { RawCandidate } from '../types/detection';
import { resolveOverlaps } from './overlapResolver';

describe('resolveOverlaps', () => {
  it('returns an empty array for empty input', () => {
    expect(resolveOverlaps([])).toEqual([]);
  });

  it('prefers the longer span when candidates are nested or overlap', () => {
    const candidates: RawCandidate[] = [
      { category: 'phone', value: '5678901234', start: 6, end: 16 },
      {
        category: 'credit_card',
        value: '4532125678901234',
        start: 0,
        end: 16,
      },
      { category: 'aadhaar', value: '453212567890', start: 0, end: 12 },
    ];

    expect(resolveOverlaps(candidates)).toEqual([
      {
        category: 'credit_card',
        value: '4532125678901234',
        start: 0,
        end: 16,
      },
    ]);
  });

  it('breaks equal-length overlap ties using category specificity', () => {
    const candidates: RawCandidate[] = [
      { category: 'phone', value: '9876543210', start: 0, end: 10 },
      { category: 'aadhaar', value: '9876543210', start: 0, end: 10 },
      { category: 'credit_card', value: '9876543210', start: 0, end: 10 },
      { category: 'pan', value: '9876543210', start: 0, end: 10 },
      { category: 'ip', value: '9876543210', start: 0, end: 10 },
      { category: 'email', value: '9876543210', start: 0, end: 10 },
    ];

    expect(resolveOverlaps(candidates)).toEqual([
      { category: 'email', value: '9876543210', start: 0, end: 10 },
    ]);

    expect(
      resolveOverlaps([
        { category: 'phone', value: '1234567890', start: 0, end: 10 },
        { category: 'ip', value: '1234567890', start: 0, end: 10 },
      ]),
    ).toEqual([{ category: 'ip', value: '1234567890', start: 0, end: 10 }]);

    expect(
      resolveOverlaps([
        { category: 'aadhaar', value: '123456789012', start: 0, end: 12 },
        { category: 'credit_card', value: '123456789012', start: 0, end: 12 },
      ]),
    ).toEqual([
      { category: 'credit_card', value: '123456789012', start: 0, end: 12 },
    ]);
  });

  it('breaks equal-length and equal-category ties by earlier start offset', () => {
    const candidates: RawCandidate[] = [
      { category: 'phone', value: '9876543210', start: 5, end: 15 },
      { category: 'phone', value: '9123498765', start: 0, end: 10 },
    ];

    expect(resolveOverlaps(candidates)).toEqual([
      { category: 'phone', value: '9123498765', start: 0, end: 10 },
    ]);
  });

  it('preserves adjacent non-overlapping candidates and sorts ascending by start', () => {
    const candidates: RawCandidate[] = [
      { category: 'pan', value: 'ABCDE1234F', start: 10, end: 20 },
      { category: 'phone', value: '9876543210', start: 0, end: 10 },
    ];

    expect(resolveOverlaps(candidates)).toEqual([
      { category: 'phone', value: '9876543210', start: 0, end: 10 },
      { category: 'pan', value: 'ABCDE1234F', start: 10, end: 20 },
    ]);
  });

  it('deduplicates identical candidates', () => {
    const candidates: RawCandidate[] = [
      { category: 'email', value: 'a@b.co', start: 2, end: 8 },
      { category: 'email', value: 'a@b.co', start: 2, end: 8 },
    ];

    expect(resolveOverlaps(candidates)).toEqual([
      { category: 'email', value: 'a@b.co', start: 2, end: 8 },
    ]);
  });
});
