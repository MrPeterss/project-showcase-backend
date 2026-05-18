import { describe, expect, it } from 'vitest';

import { buildCourseOfferingOrigin } from '../../src/spark/sparkService.js';

describe('sparkService', () => {
  it('buildCourseOfferingOrigin builds the canonical label', () => {
    const offering = {
      course: { department: 'CS', number: 4300 },
      semester: { season: 'Fall', year: 2025 },
    };

    expect(buildCourseOfferingOrigin(offering as never)).toBe(
      'Project Server CS4300 Fall 2025',
    );
  });
});
