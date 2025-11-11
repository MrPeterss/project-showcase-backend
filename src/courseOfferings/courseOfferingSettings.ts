import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { prisma } from '../prisma.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';

// Enum for processable course offering settings keys
export enum CourseOfferingSettingKey {
  COURSE_VISIBILITY = 'course_visibility',
}

// Helper function to check if user is instructor of course offering
const checkInstructorAccess = async (userId: number, offeringId: number) => {
  const enrollment = await prisma.courseOfferingEnrollment.findUnique({
    where: {
      userId_courseOfferingId: {
        userId,
        courseOfferingId: offeringId,
      },
    },
  });

  return enrollment && enrollment.role === COURSE_OFFERING_ROLES.INSTRUCTOR;
};

/**
 * Processes course_visibility setting changes
 * Grants/removes viewer enrollments for students based on course visibility settings
 */
export const processCourseVisibilitySetting = async (
  offeringId: number,
  oldSettings: Record<string, unknown>,
  newSettings: Record<string, unknown>,
  userId: number,
  isAdmin: boolean,
) => {
  const oldCourseVisibility = Array.isArray(
    oldSettings[CourseOfferingSettingKey.COURSE_VISIBILITY],
  )
    ? (oldSettings[CourseOfferingSettingKey.COURSE_VISIBILITY] as number[])
    : [];
  const newCourseVisibility = Array.isArray(
    newSettings[CourseOfferingSettingKey.COURSE_VISIBILITY],
  )
    ? (newSettings[CourseOfferingSettingKey.COURSE_VISIBILITY] as number[])
    : [];

  // If course_visibility is being updated, validate and manage enrollments
  if (
    JSON.stringify(oldCourseVisibility.sort()) !==
    JSON.stringify(newCourseVisibility.sort())
  ) {
    // Validate that user has permission to grant access to each target course
    for (const targetOfferingId of newCourseVisibility) {
      if (!isAdmin) {
        const hasAccess = await checkInstructorAccess(userId, targetOfferingId);
        if (!hasAccess) {
          throw new ForbiddenError(
            `You must be an instructor of course offering ${targetOfferingId} to grant access to it`,
          );
        }
      }

      // Verify the target course offering exists
      const targetOffering = await prisma.courseOffering.findUnique({
        where: { id: targetOfferingId },
      });
      if (!targetOffering) {
        throw new NotFoundError(
          `Course offering ${targetOfferingId} not found`,
        );
      }
    }

    // Find courses added and removed
    const addedCourses = newCourseVisibility.filter(
      (id) => !oldCourseVisibility.includes(id),
    );
    const removedCourses = oldCourseVisibility.filter(
      (id) => !newCourseVisibility.includes(id),
    );

    // Get all students in the current course offering
    const students = await prisma.courseOfferingEnrollment.findMany({
      where: {
        courseOfferingId: offeringId,
        role: COURSE_OFFERING_ROLES.STUDENT,
      },
      select: { userId: true },
    });

    const studentIds = students.map((s) => s.userId);

    // Remove viewer enrollments for removed courses
    if (removedCourses.length > 0 && studentIds.length > 0) {
      // Find enrollments to delete
      const enrollmentsToDelete = await prisma.courseOfferingEnrollment.findMany(
        {
          where: {
            userId: { in: studentIds },
            courseOfferingId: { in: removedCourses },
            role: COURSE_OFFERING_ROLES.VIEWER,
          },
        },
      );

      // Filter to only those with matching referringCourseId and delete them
      const matchingEnrollments = enrollmentsToDelete.filter(
        (enrollment) => enrollment.referringCourseId === offeringId,
      );

      // Delete the matching enrollments
      for (const enrollment of matchingEnrollments) {
        await prisma.courseOfferingEnrollment.delete({
          where: {
            userId_courseOfferingId: {
              userId: enrollment.userId,
              courseOfferingId: enrollment.courseOfferingId,
            },
          },
        });
      }
    }

    // Add viewer enrollments for added courses
    if (addedCourses.length > 0 && studentIds.length > 0) {
      // Get existing viewer enrollments to avoid duplicates
      const existingEnrollments = await prisma.courseOfferingEnrollment.findMany(
        {
          where: {
            userId: { in: studentIds },
            courseOfferingId: { in: addedCourses },
            role: COURSE_OFFERING_ROLES.VIEWER,
          },
          select: {
            userId: true,
            courseOfferingId: true,
          },
        },
      );

      const existingKeys = new Set(
        existingEnrollments.map(
          (e) => `${e.userId}-${e.courseOfferingId}`,
        ),
      );

      // Create new viewer enrollments
      const enrollmentsToCreate = [];
      for (const studentId of studentIds) {
        for (const targetOfferingId of addedCourses) {
          const key = `${studentId}-${targetOfferingId}`;
          if (!existingKeys.has(key)) {
            enrollmentsToCreate.push({
              userId: studentId,
              courseOfferingId: targetOfferingId,
              role: COURSE_OFFERING_ROLES.VIEWER,
              referringCourseId: offeringId,
            });
          }
        }
      }

      if (enrollmentsToCreate.length > 0) {
        await prisma.courseOfferingEnrollment.createMany({
          data: enrollmentsToCreate,
        });
      }
    }
  }
};

/**
 * Processes all course offering settings changes
 * Routes to appropriate handler based on setting key
 */
export const processCourseOfferingSettings = async (
  offeringId: number,
  oldSettings: Record<string, unknown>,
  newSettings: Record<string, unknown>,
  userId: number,
  isAdmin: boolean,
) => {
  // Process course_visibility setting if present
  if (
    CourseOfferingSettingKey.COURSE_VISIBILITY in oldSettings ||
    CourseOfferingSettingKey.COURSE_VISIBILITY in newSettings
  ) {
    await processCourseVisibilitySetting(
      offeringId,
      oldSettings,
      newSettings,
      userId,
      isAdmin,
    );
  }
};

