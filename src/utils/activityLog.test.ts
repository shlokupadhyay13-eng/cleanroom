import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVITY_LOG_ENTRIES,
  appendActivityEntry,
  createActivityEntry,
  formatLocalTimestamp,
} from './activityLog';

describe('activityLog', () => {
  it('formats timestamps and creates entries with unique IDs and metadata', () => {
    const sampleDate = new Date(2026, 10, 27, 9, 5, 3);
    expect(formatLocalTimestamp(sampleDate)).toBe('09:05:03');

    const first = createActivityEntry({
      action: 'sanitize',
      summary: 'Sanitized TEXT input.',
      mode: 'full',
      entityCount: 4,
      sourceFormat: 'text',
      date: sampleDate,
    });
    const second = createActivityEntry({
      action: 'copy',
      summary: 'Copied sanitized output.',
      date: sampleDate,
    });

    expect(first.id).not.toBe(second.id);
    expect(first.timestamp).toBe('09:05:03');
    expect(first.mode).toBe('full');
    expect(first.entityCount).toBe(4);
    expect(first.sourceFormat).toBe('text');
  });

  it('prepends newest entries first and caps the log at MAX_ACTIVITY_LOG_ENTRIES', () => {
    let entries = [] as ReturnType<typeof createActivityEntry>[];

    for (let index = 1; index <= MAX_ACTIVITY_LOG_ENTRIES + 5; index += 1) {
      entries = appendActivityEntry(
        entries,
        createActivityEntry({
          action: 'sample',
          summary: `Entry ${index}`,
        }),
      );
    }

    expect(entries).toHaveLength(MAX_ACTIVITY_LOG_ENTRIES);
    expect(entries[0]?.summary).toBe(
      `Entry ${MAX_ACTIVITY_LOG_ENTRIES + 5}`,
    );
    expect(entries[entries.length - 1]?.summary).toBe('Entry 6');
  });
});
