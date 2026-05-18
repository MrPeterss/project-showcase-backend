import type { Prisma } from '@prisma/client';

export const courseAdminDetailSelect = {
  id: true,
  name: true,
  number: true,
  department: true,
  createdAt: true,
  offerings: {
    select: {
      id: true,
      semester: {
        select: {
          id: true,
          season: true,
          year: true,
          startDate: true,
          endDate: true,
        },
      },
      settings: true,
      enrollments: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

export type CourseAdminDetail = Prisma.CourseGetPayload<{
  select: typeof courseAdminDetailSelect;
}>;

export function toCourseAdminDetail(row: CourseAdminDetail): CourseAdminDetail {
  return row;
}
