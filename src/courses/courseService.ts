import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';
import {
  courseAdminDetailSelect,
  type CourseAdminDetail,
  toCourseAdminDetail,
} from './courseMappers.js';

export async function getCourseByIdForAdmin(
  courseId: number,
): Promise<CourseAdminDetail> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: courseAdminDetailSelect,
  });

  if (!course) {
    throw new NotFoundError('Course not found');
  }

  return toCourseAdminDetail(course);
}
