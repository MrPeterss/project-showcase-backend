import type { CourseOfferingRole } from '@prisma/client';

import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { prisma } from '../prisma.js';

/**
 * Get enrollment with highest access level for a user in a course offering.
 * Role hierarchy: INSTRUCTOR > STUDENT > VIEWER
 * 
 * @param userId - The ID of the user
 * @param offeringId - The ID of the course offering
 * @returns The enrollment with the highest access level, or null if no enrollment exists
 */
export const getHighestAccessEnrollment = async (
  userId: number,
  offeringId: number,
) => {
  const enrollments = await prisma.courseOfferingEnrollment.findMany({
    where: {
      userId,
      courseOfferingId: offeringId,
    },
  });

  if (enrollments.length === 0) {
    return null;
  }

  // If multiple enrollments exist, return the one with highest access level
  const rolePriority: Record<CourseOfferingRole, number> = {
    INSTRUCTOR: 3,
    STUDENT: 2,
    VIEWER: 1,
  };

  return enrollments.reduce((highest, current) => {
    return rolePriority[current.role] > rolePriority[highest.role]
      ? current
      : highest;
  });
};

/**
 * Check if a user has access to a course offering with specific required roles.
 * 
 * @param userId - The ID of the user
 * @param offeringId - The ID of the course offering
 * @param requiredRoles - Optional array of roles that are acceptable (if not provided, any enrollment grants access)
 * @returns The enrollment if user has access, null otherwise
 */
export const checkCourseOfferingAccess = async (
  userId: number,
  offeringId: number,
  requiredRoles?: string[],
) => {
  const enrollment = await getHighestAccessEnrollment(userId, offeringId);

  if (!enrollment) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(enrollment.role)) {
    return null;
  }

  return enrollment;
};

/**
 * Check if a user is an instructor of a course offering.
 * 
 * @param userId - The ID of the user
 * @param offeringId - The ID of the course offering
 * @returns The enrollment if user is an instructor, null otherwise
 */
export const checkInstructorAccess = async (
  userId: number,
  offeringId: number,
) => {
  return await checkCourseOfferingAccess(userId, offeringId, [
    COURSE_OFFERING_ROLES.INSTRUCTOR,
  ]);
};

/**
 * Check if a user is a student in a course offering.
 * 
 * @param userId - The ID of the user
 * @param offeringId - The ID of the course offering
 * @returns The enrollment if user is a student, null otherwise
 */
export const checkStudentAccess = async (
  userId: number,
  offeringId: number,
) => {
  return await checkCourseOfferingAccess(userId, offeringId, [
    COURSE_OFFERING_ROLES.STUDENT,
  ]);
};
