import { describe, expect, it } from 'vitest';

import { parseStoredCourseOfferingSettings } from '../../src/courseOfferings/courseOfferingSettingsSchema.js';

describe('parseStoredCourseOfferingSettings', () => {
  it('returns {} for nullish inputs', () => {
    expect(parseStoredCourseOfferingSettings(null)).toEqual({});
    expect(parseStoredCourseOfferingSettings(undefined)).toEqual({});
  });

  it('parses plain objects', () => {
    expect(
      parseStoredCourseOfferingSettings({ serverLocked: true }),
    ).toEqual({
      serverLocked: true,
    });
  });

  it('rejects non-record roots', () => {
    expect(() => parseStoredCourseOfferingSettings('oops')).toThrow();
  });
});
