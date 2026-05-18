import { describe, expect, it } from 'vitest';

import { semesterSchema } from '../../src/semesters/semester.schema.js';

describe('semesterSchema', () => {
  it('accepts RFC3339-ish datetime strings', () => {
    const parsed = semesterSchema.parse({
      body: {
        season: 'Fall',
        year: 2026,
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
      },
    });

    expect(parsed.body.year).toBe(2026);
  });

  it('rejects malformed dates', () => {
    expect(() =>
      semesterSchema.parse({
        body: {
          season: 'Fall',
          year: 2026,
          startDate: 'not-a-date',
          endDate: '2026-12-01T00:00:00.000Z',
        },
      }),
    ).toThrow();
  });
});
