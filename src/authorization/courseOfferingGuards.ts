import type { CourseOffering } from '@prisma/client';

import { prisma } from '../prisma.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';
import {
  checkCourseOfferingAccess,
  checkInstructorAccess,
  checkTeachingStaffAccess,
} from '../utils/authorizationHelpers.js';

export async function assertCourseOfferingExists(
  offeringId: number,
): Promise<CourseOffering> {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });
  if (!offering) {
    throw new NotFoundError('Course offering not found');
  }
  return offering;
}

export type OfferingAccessPolicy =
  | 'anyEnrollment'
  | 'instructorOnly'
  | 'teachingStaff';

/**
 * Ensures the offering exists and the user satisfies the policy (admins always pass).
 */
export async function assertOfferingAccessForUser(
  userId: number,
  offeringId: number,
  isAdmin: boolean,
  policy: OfferingAccessPolicy,
  forbiddenMessage = 'Access denied to this course offering',
): Promise<void> {
  await assertCourseOfferingExists(offeringId);
  if (isAdmin) {
    return;
  }

  let allowed = false;
  if (policy === 'anyEnrollment') {
    allowed = !!(await checkCourseOfferingAccess(userId, offeringId));
  } else if (policy === 'instructorOnly') {
    allowed = !!(await checkInstructorAccess(userId, offeringId));
  } else {
    allowed = !!(await checkTeachingStaffAccess(userId, offeringId));
  }

  if (!allowed) {
    throw new ForbiddenError(forbiddenMessage);
  }
}
