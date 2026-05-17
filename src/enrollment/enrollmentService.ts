import type { CourseOfferingRole } from '@prisma/client';

import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { CourseOfferingSettingKey } from '../courseOfferings/courseOfferingSettings.js';
import { prisma } from '../prisma.js';

/**
 * Adds a student enrollment to a course offering and grants viewer access
 * to any courses specified in the course_visibility settings.
 * 
 * @param userId - The ID of the user to enroll
 * @param offeringId - The ID of the course offering to enroll in
 * @param role - The role to assign (STUDENT, INSTRUCTOR, TA, or VIEWER)
 * @param referringCourseId - Optional ID of the course that referred this enrollment
 * @returns The created enrollment
 */
export const addStudentEnrollment = async (
  userId: number,
  offeringId: number,
  role: CourseOfferingRole,
  referringCourseId?: number,
) => {
  // Create the main enrollment
  const enrollment = await prisma.courseOfferingEnrollment.create({
    data: {
      userId,
      courseOfferingId: offeringId,
      role,
      referringCourseId,
    },
  });

  // If the role is STUDENT, grant viewer enrollments based on course_visibility settings
  if (role === COURSE_OFFERING_ROLES.STUDENT) {
    await grantViewerEnrollments(userId, offeringId);
  }

  return enrollment;
};

/**
 * Grants viewer enrollments to a student based on the course_visibility settings
 * of their enrolled course offering.
 * 
 * @param userId - The ID of the user to grant viewer access to
 * @param offeringId - The ID of the course offering the student is enrolled in
 */
export const grantViewerEnrollments = async (
  userId: number,
  offeringId: number,
) => {
  const courseOfferingWithSettings = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: { settings: true },
  });

  if (!courseOfferingWithSettings) {
    return;
  }

  const settings =
    (courseOfferingWithSettings.settings as Record<string, unknown>) || {};
  const courseVisibility = Array.isArray(
    settings[CourseOfferingSettingKey.COURSE_VISIBILITY],
  )
    ? (settings[CourseOfferingSettingKey.COURSE_VISIBILITY] as number[])
    : [];

  if (courseVisibility.length === 0) {
    return;
  }

  // Get existing viewer enrollments to avoid duplicates
  const existingEnrollments = await prisma.courseOfferingEnrollment.findMany({
    where: {
      userId,
      courseOfferingId: { in: courseVisibility },
      role: COURSE_OFFERING_ROLES.VIEWER,
    },
    select: {
      userId: true,
      courseOfferingId: true,
    },
  });

  const existingKeys = new Set(
    existingEnrollments.map((e) => `${e.userId}-${e.courseOfferingId}`),
  );

  // Create new viewer enrollments
  const enrollmentsToCreate = [];
  for (const targetOfferingId of courseVisibility) {
    const key = `${userId}-${targetOfferingId}`;
    if (!existingKeys.has(key)) {
      enrollmentsToCreate.push({
        userId,
        courseOfferingId: targetOfferingId,
        role: COURSE_OFFERING_ROLES.VIEWER,
        referringCourseId: offeringId,
      });
    }
  }

  if (enrollmentsToCreate.length > 0) {
    await prisma.courseOfferingEnrollment.createMany({
      data: enrollmentsToCreate,
    });
  }
};

/**
 * Removes viewer enrollments that were granted by a specific course offering.
 * 
 * @param userId - The ID of the user to remove viewer access from
 * @param referringCourseId - The ID of the course that granted the viewer access
 */
export const revokeViewerEnrollments = async (
  userId: number,
  referringCourseId: number,
) => {
  await prisma.courseOfferingEnrollment.deleteMany({
    where: {
      userId,
      role: COURSE_OFFERING_ROLES.VIEWER,
      referringCourseId,
    },
  });
};

/**
 * Removes a student enrollment from a course offering and cleans up
 * any viewer enrollments that were granted by that course.
 * 
 * @param userId - The ID of the user to remove
 * @param offeringId - The ID of the course offering to remove from
 */
export const removeStudentEnrollment = async (
  userId: number,
  offeringId: number,
) => {
  // Get the enrollment to check if it's a student
  const enrollment = await prisma.courseOfferingEnrollment.findFirst({
    where: {
      userId,
      courseOfferingId: offeringId,
    },
  });

  if (!enrollment) {
    return;
  }

  const isStudent = enrollment.role === COURSE_OFFERING_ROLES.STUDENT;

  // Delete all enrollments for this user/course combination
  await prisma.courseOfferingEnrollment.deleteMany({
    where: {
      userId,
      courseOfferingId: offeringId,
    },
  });

  // If it was a student, remove viewer enrollments they were given by this course
  if (isStudent) {
    await revokeViewerEnrollments(userId, offeringId);
  }
};

/**
 * Updates a student's role in a course offering and manages viewer enrollments
 * accordingly. If changing from STUDENT to another role, viewer access is revoked.
 * If changing to STUDENT from another role, viewer access is granted.
 * 
 * @param userId - The ID of the user whose role is being updated
 * @param offeringId - The ID of the course offering
 * @param newRole - The new role to assign
 * @param existingRole - The existing role (optional, will be fetched if not provided)
 * @returns The updated enrollment
 */
export const updateStudentRole = async (
  userId: number,
  offeringId: number,
  newRole: CourseOfferingRole,
  existingRole?: CourseOfferingRole,
) => {
  // Get existing enrollment if role not provided
  let currentRole = existingRole;
  let referringCourseId: number | null = null;

  if (!currentRole) {
    const existingEnrollment = await prisma.courseOfferingEnrollment.findFirst({
      where: {
        userId,
        courseOfferingId: offeringId,
      },
    });

    if (existingEnrollment) {
      currentRole = existingEnrollment.role;
      referringCourseId = existingEnrollment.referringCourseId;
    }
  }

  const wasStudent = currentRole === COURSE_OFFERING_ROLES.STUDENT;
  const willBeStudent = newRole === COURSE_OFFERING_ROLES.STUDENT;

  // Delete all existing enrollments and create a new one with the updated role
  await prisma.courseOfferingEnrollment.deleteMany({
    where: {
      userId,
      courseOfferingId: offeringId,
    },
  });

  // Create new enrollment with updated role
  const updatedEnrollment = await prisma.courseOfferingEnrollment.create({
    data: {
      userId,
      courseOfferingId: offeringId,
      role: newRole,
      referringCourseId,
    },
  });

  // Handle viewer enrollments based on role change
  if (wasStudent && !willBeStudent) {
    // Student role removed - remove viewer enrollments created by this course
    await revokeViewerEnrollments(userId, offeringId);
  } else if (!wasStudent && willBeStudent) {
    // Student role added - grant viewer enrollments based on course_visibility settings
    await grantViewerEnrollments(userId, offeringId);
  }

  return updatedEnrollment;
};

/**
 * Bulk adds student enrollments and grants viewer access to all.
 * More efficient than calling addStudentEnrollment multiple times.
 * 
 * @param userIds - Array of user IDs to enroll
 * @param offeringId - The ID of the course offering to enroll in
 * @param role - The role to assign (typically STUDENT)
 */
export const bulkAddStudentEnrollments = async (
  userIds: number[],
  offeringId: number,
  role: CourseOfferingRole,
) => {
  if (userIds.length === 0) {
    return;
  }

  // Create all enrollments
  await prisma.courseOfferingEnrollment.createMany({
    data: userIds.map((userId) => ({
      userId,
      courseOfferingId: offeringId,
      role,
    })),
  });

  // If the role is STUDENT, grant viewer enrollments in bulk
  if (role === COURSE_OFFERING_ROLES.STUDENT) {
    await bulkGrantViewerEnrollments(userIds, offeringId);
  }
};

/**
 * Bulk grants viewer enrollments to multiple students based on course_visibility settings.
 * 
 * @param userIds - Array of user IDs to grant viewer access to
 * @param offeringId - The ID of the course offering the students are enrolled in
 */
export const bulkGrantViewerEnrollments = async (
  userIds: number[],
  offeringId: number,
) => {
  if (userIds.length === 0) {
    return;
  }

  const courseOfferingWithSettings = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: { settings: true },
  });

  if (!courseOfferingWithSettings) {
    return;
  }

  const settings =
    (courseOfferingWithSettings.settings as Record<string, unknown>) || {};
  const courseVisibility = Array.isArray(
    settings[CourseOfferingSettingKey.COURSE_VISIBILITY],
  )
    ? (settings[CourseOfferingSettingKey.COURSE_VISIBILITY] as number[])
    : [];

  if (courseVisibility.length === 0) {
    return;
  }

  // Get existing viewer enrollments to avoid duplicates
  const existingEnrollments = await prisma.courseOfferingEnrollment.findMany({
    where: {
      userId: { in: userIds },
      courseOfferingId: { in: courseVisibility },
      role: COURSE_OFFERING_ROLES.VIEWER,
    },
    select: {
      userId: true,
      courseOfferingId: true,
    },
  });

  const existingKeys = new Set(
    existingEnrollments.map((e) => `${e.userId}-${e.courseOfferingId}`),
  );

  // Create new viewer enrollments
  const enrollmentsToCreate = [];
  for (const userId of userIds) {
    for (const targetOfferingId of courseVisibility) {
      const key = `${userId}-${targetOfferingId}`;
      if (!existingKeys.has(key)) {
        enrollmentsToCreate.push({
          userId,
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
};
