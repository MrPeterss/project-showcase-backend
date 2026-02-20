import type { CourseOfferingRole } from '@prisma/client';

import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import {
  getHighestAccessEnrollment,
  checkInstructorAccess,
} from '../utils/authorizationHelpers.js';
import {
  addStudentEnrollment,
  removeStudentEnrollment,
  updateStudentRole,
} from './enrollmentService.js';

// GET /course-offerings/:offeringId/enrollments
export const getCourseOfferingEnrollments = async (
  req: Request,
  res: Response,
) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(userId, offeringId);
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can view enrollments');
    }
  }

  const enrollments = await prisma.courseOfferingEnrollment.findMany({
    where: { courseOfferingId: offeringId },
    include: {
      user: {
        select: { id: true, email: true, name: true, createdAt: true },
      },
    },
  });

  return res.json(enrollments);
};

// POST /course-offerings/:offeringId/enrollments
export const createCourseOfferingEnrollments = async (
  req: Request,
  res: Response,
) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const { enrollments } = req.body;

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(userId, offeringId);
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can manage enrollments');
    }
  }

  const createdEnrollments = [];

  for (const enrollment of enrollments) {
    const { email, role, name } = enrollment;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Only set name when creating a new user
      const userData: { email: string; name?: string } = { email };
      if (name) {
        userData.name = name;
      }
      user = await prisma.user.create({
        data: userData,
      });
    }

    // Check if already enrolled
    const existingEnrollment = await getHighestAccessEnrollment(
      user.id,
      offeringId,
    );

    if (existingEnrollment) {
      throw new ConflictError(
        `User ${email} is already enrolled in this course offering`,
      );
    }

    // Create enrollment using service function (handles viewer enrollments automatically)
    await addStudentEnrollment(
      user.id,
      offeringId,
      role as CourseOfferingRole,
    );

    // Fetch the created enrollment with user details
    const newEnrollment = await prisma.courseOfferingEnrollment.findFirst({
      where: {
        userId: user.id,
        courseOfferingId: offeringId,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, createdAt: true },
        },
      },
    });

    if (newEnrollment) {
      createdEnrollments.push(newEnrollment);
    }
  }

  return res.status(201).json(createdEnrollments);
};

// PUT /course-offerings/:offeringId/enrollments/:userId
export const updateCourseOfferingEnrollment = async (
  req: Request,
  res: Response,
) => {
  const { userId: currentUserId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  const { role } = req.body;

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(currentUserId, offeringId);
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can update enrollments');
    }
  }

  // Check if enrollment exists
  const existingEnrollment = await getHighestAccessEnrollment(
    targetUserId,
    offeringId,
  );

  if (!existingEnrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  // Update role using service function (handles viewer enrollments automatically)
  await updateStudentRole(
    targetUserId,
    offeringId,
    role as CourseOfferingRole,
    existingEnrollment.role,
  );

  // Fetch the updated enrollment with user details
  const updatedEnrollment = await prisma.courseOfferingEnrollment.findFirst({
    where: {
      userId: targetUserId,
      courseOfferingId: offeringId,
    },
    include: {
      user: {
        select: { id: true, email: true, createdAt: true },
      },
    },
  });

  return res.json(updatedEnrollment);
};

// DELETE /course-offerings/:offeringId/enrollments/:userId
export const deleteCourseOfferingEnrollment = async (
  req: Request,
  res: Response,
) => {
  const { userId: currentUserId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const targetUserId = parseInt(req.params.userId, 10);

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(currentUserId, offeringId);
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can remove enrollments');
    }
  }

  // Check if enrollment exists
  const existingEnrollment = await getHighestAccessEnrollment(
    targetUserId,
    offeringId,
  );

  if (!existingEnrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  // Remove enrollment using service function (handles viewer enrollments automatically)
  await removeStudentEnrollment(targetUserId, offeringId);

  // Also remove from any teams in this course offering
  await prisma.teamMembership.deleteMany({
    where: {
      userId: targetUserId,
      team: {
        courseOfferingId: offeringId,
      },
    },
  });

  return res.status(204).send();
};
