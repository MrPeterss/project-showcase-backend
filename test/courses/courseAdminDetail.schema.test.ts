import { describe, expect, it } from 'vitest';

import { courseAdminDetailSchema } from '../../src/courses/courseAdminDetail.schema.js';

describe('courseAdminDetailSchema', () => {
  it('accepts a minimal admin-detail-shaped payload', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const parsed = courseAdminDetailSchema.parse({
      id: 1,
      name: 'Intro',
      number: 1000,
      department: 'CS',
      createdAt: d,
      offerings: [
        {
          id: 10,
          semester: {
            id: 2,
            season: 'Fall',
            year: 2026,
            startDate: d,
            endDate: d,
          },
          settings: { foo: 'bar' },
          enrollments: [{ user: { id: 3, email: 'a@b.edu' } }],
        },
      ],
    });
    expect(parsed.offerings).toHaveLength(1);
    expect(parsed.offerings[0]?.semester.year).toBe(2026);
  });

  it('rejects wrong enrollment nesting', () => {
    expect(() =>
      courseAdminDetailSchema.parse({
        id: 1,
        name: 'Intro',
        number: 1000,
        department: 'CS',
        createdAt: new Date(),
        offerings: [
          {
            id: 10,
            semester: {
              id: 2,
              season: 'Fall',
              year: 2026,
              startDate: new Date(),
              endDate: new Date(),
            },
            settings: {},
            enrollments: [{ email: 'bad' }],
          },
        ],
      }),
    ).toThrow();
  });
});
