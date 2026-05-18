import { describe, expect, it } from 'vitest';

import { courseParamsSchema, courseSchema } from '../../src/courses/courses.schema.js';

describe('courses.schema', () => {
  it('courseParamsSchema coerces courseId param', () => {
    const parsed = courseParamsSchema.parse({ params: { courseId: '12' } });
    expect(parsed.params.courseId).toBe(12);
  });

  it('courseSchema validates create payload', () => {
    const parsed = courseSchema.parse({
      body: {
        name: 'Algorithms',
        number: 4820,
        department: 'Computer Science',
      },
    });
    expect(parsed.body.number).toBe(4820);
  });
});
