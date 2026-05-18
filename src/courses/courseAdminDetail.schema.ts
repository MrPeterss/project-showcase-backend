import { z } from 'zod';

/** Locks the GET /courses/:courseId admin JSON shape expected by the UI. */
export const semesterAdminSummarySchema = z.object({
  id: z.number().int(),
  season: z.string(),
  year: z.number().int(),
  startDate: z.date(),
  endDate: z.date(),
});

export const courseAdminDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  department: z.string(),
  createdAt: z.date(),
  offerings: z.array(
    z.object({
      id: z.number().int(),
      semester: semesterAdminSummarySchema,
      settings: z.unknown(),
      enrollments: z.array(
        z.object({
          user: z.object({
            id: z.number().int(),
            email: z.string(),
          }),
        }),
      ),
    }),
  ),
});
