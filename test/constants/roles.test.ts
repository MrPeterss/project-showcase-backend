import { describe, expect, it } from 'vitest';

import {
  COURSE_OFFERING_ROLE_VALUES,
  COURSE_OFFERING_ROLES,
  SYSTEM_ROLES,
} from '../../src/constants/roles.js';

describe('roles constants', () => {
  it('covers every course offering role value once', () => {
    expect(COURSE_OFFERING_ROLE_VALUES).toHaveLength(4);
    expect(COURSE_OFFERING_ROLE_VALUES).toContain(COURSE_OFFERING_ROLES.INSTRUCTOR);
    expect(COURSE_OFFERING_ROLE_VALUES).toContain(COURSE_OFFERING_ROLES.STUDENT);
  });

  it('defines system admin sentinel', () => {
    expect(SYSTEM_ROLES.ADMIN).toBe('ADMIN');
  });
});
