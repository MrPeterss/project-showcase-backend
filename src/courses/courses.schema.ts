import { z } from 'zod';

import { courseIdParam } from '../schemas/paramCoercions.js';

export const courseSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    number: z.number().min(1000).max(9999),
    department: z.string().min(2).max(100),
  }),
});

export const courseParamsSchema = z.object({
  params: z.object({
    courseId: courseIdParam,
  }),
});
