import { describe, expect, it } from 'vitest';

import {
  courseAdminDetailSelect,
  toCourseAdminDetail,
} from '../../src/courses/courseMappers.js';

describe('courseMappers', () => {
  it('exports an explicit admin select shape', () => {
    expect(courseAdminDetailSelect.offerings).toBeDefined();
    expect(courseAdminDetailSelect.name).toBe(true);
  });

  it('identity-maps prisma payloads for JSON responses', () => {
    const row = {
      id: 1,
      name: 'c',
      number: 2110,
      department: 'CS',
      createdAt: new Date(),
      offerings: [],
    };
    expect(toCourseAdminDetail(row as never)).toBe(row);
  });
});
