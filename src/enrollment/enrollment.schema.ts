import { z } from 'zod';

import { COURSE_OFFERING_ROLE_VALUES } from '../constants/roles.js';
import { offeringIdParam, userIdParam } from '../schemas/paramCoercions.js';

export const createEnrollmentsSchema = z.object({
  body: z.object({
    enrollments: z
      .array(
        z.object({
          email: z.string().email(),
          role: z.enum(COURSE_OFFERING_ROLE_VALUES),
          name: z.string().optional(),
        }),
      )
      .min(1),
  }),
});

export const updateEnrollmentSchema = z.object({
  body: z.object({
    role: z.enum(COURSE_OFFERING_ROLE_VALUES),
  }),
});

export const enrollmentParamsSchema = z.object({
  params: z.object({
    offeringId: offeringIdParam,
    userId: userIdParam,
  }),
});
