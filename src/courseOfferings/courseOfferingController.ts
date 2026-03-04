import type { CourseOfferingRole } from '@prisma/client';

import type { Request, Response } from 'express';

import { COURSE_OFFERING_ROLES, SYSTEM_ROLES } from '../constants/roles.js';
import { prisma } from '../prisma.js';
import {
  removeTagFromCourseOfferingProjects as removeTagService,
  tagCourseOfferingProjects as tagProjectsService,
} from '../projects/projectService.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import {
  checkCourseOfferingAccess,
  checkInstructorAccess,
} from '../utils/authorizationHelpers.js';
import {
  deleteCourseOfferingWithCleanup,
  lockCourseOfferingServer as lockCourseOfferingServerService,
  unlockCourseOfferingServer as unlockCourseOfferingServerService,
} from './courseOfferingService.js';
import { processCourseOfferingSettings } from './courseOfferingSettings.js';

// GET /course-offerings
export const getAllCourseOfferings = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const { role } = req.query;

  let courseOfferings;

  if (isAdmin) {
    // Admin can see all course offerings (without enrollments/settings for list view)
    courseOfferings = await prisma.courseOffering.findMany({
      include: {
        course: true,
        semester: true,
      },
    });

    // Add userRole for admin (they have access to everything)
    return res.json(
      courseOfferings.map((offering) => ({
        ...offering,
        userRole: SYSTEM_ROLES.ADMIN,
      })),
    );
  }

  // Regular users can only see offerings they're enrolled in (without enrollments/settings for list view)
  const enrollments = await prisma.courseOfferingEnrollment.findMany({
    where: {
      userId,
      ...(role && { role: role as CourseOfferingRole }),
    },
    include: {
      courseOffering: {
        include: {
          course: true,
          semester: true,
        },
      },
    },
  });

  courseOfferings = enrollments.map((enrollment) => ({
    ...enrollment.courseOffering,
    userRole: enrollment.role,
  }));

  return res.json(courseOfferings);
};

// GET /course-offerings/:offeringId
export const getCourseOffering = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      course: true,
      semester: true,
      enrollments: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  let userRole: string | null = null;

  if (!isAdmin) {
    // Check if user is enrolled
    const enrollment = await checkCourseOfferingAccess(userId, offeringId);
    if (!enrollment) {
      throw new ForbiddenError('Access denied to this course offering');
    }
    userRole = enrollment.role;
  } else {
    userRole = SYSTEM_ROLES.ADMIN;
  }

  // Check if user should have access to enrollments
  const hasInstructorAccess =
    userRole === COURSE_OFFERING_ROLES.INSTRUCTOR ||
    userRole === SYSTEM_ROLES.ADMIN;

  const isViewer = userRole === COURSE_OFFERING_ROLES.VIEWER;

  // Omit enrollments if user is not an instructor or admin
  // Omit settings if user is a viewer (students and instructors can see serverLocked status)
  const response = {
    ...courseOffering,
    userRole,
    ...(!hasInstructorAccess && { enrollments: undefined }),
    ...(isViewer && { settings: undefined }),
  };

  return res.json(response);
};

// POST /course-offerings
export const createCourseOffering = async (req: Request, res: Response) => {
  const { courseId, semesterId, settings = {} } = req.body;

  // Check if course and semester exist
  const [course, semester] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.semester.findUnique({ where: { id: semesterId } }),
  ]);

  if (!course) {
    throw new NotFoundError('Course not found');
  }

  if (!semester) {
    throw new NotFoundError('Semester not found');
  }

  // Check if course offering already exists for this course and semester
  const existingOffering = await prisma.courseOffering.findUnique({
    where: {
      courseId_semesterId: {
        courseId,
        semesterId,
      },
    },
  });

  if (existingOffering) {
    throw new ConflictError(
      'Course offering already exists for this course and semester',
    );
  }

  const courseOffering = await prisma.courseOffering.create({
    data: {
      courseId,
      semesterId,
      settings,
    },
    include: {
      course: true,
      semester: true,
    },
  });

  return res.status(201).json(courseOffering);
};

// PUT /course-offerings/:offeringId
export const updateCourseOffering = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const { settings } = req.body;

  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only instructors can update course offering settings',
      );
    }
  }

  // Process settings changes
  const oldSettings = (courseOffering.settings as Record<string, unknown>) || {};
  const newSettings = settings || {};
  await processCourseOfferingSettings(
    offeringId,
    oldSettings,
    newSettings,
    userId,
    isAdmin,
  );

  const updatedOffering = await prisma.courseOffering.update({
    where: { id: offeringId },
    data: { settings },
    include: {
      course: true,
      semester: true,
    },
  });

  return res.json(updatedOffering);
};

// DELETE /course-offerings/:offeringId
export const deleteCourseOffering = async (req: Request, res: Response) => {
  const offeringId = parseInt(req.params.offeringId, 10);

  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Delete using service (handles all cleanup)
  await deleteCourseOfferingWithCleanup(offeringId);

  return res.status(204).send();
};

// POST /course-offerings/:offeringId/lock
export const lockCourseOfferingServer = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only admins or instructors of the course offering can lock deployments',
      );
    }
  }

  // Lock using service
  const updatedOffering = await lockCourseOfferingServerService(offeringId);

  return res.json({
    message: 'Course offering server locked successfully',
    courseOffering: updatedOffering,
  });
};

// POST /course-offerings/:offeringId/unlock
export const unlockCourseOfferingServer = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only admins or instructors of the course offering can unlock deployments',
      );
    }
  }

  // Unlock using service
  const updatedOffering = await unlockCourseOfferingServerService(offeringId);

  return res.json({
    message: 'Course offering server unlocked successfully',
    courseOffering: updatedOffering,
  });
};

// POST /course-offerings/:offeringId/projects/tag
export const tagCourseOfferingProjects = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  // Validation middleware ensures these are valid
  const offeringId = parseInt(req.params.offeringId, 10);
  const { tag } = req.body;

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only admins or instructors of the course offering can tag projects',
      );
    }
  }

  const result = await tagProjectsService(offeringId, tag);

  return res.json({
    message: 'Projects tagged successfully',
    result,
  });
};

// DELETE /course-offerings/:offeringId/projects/tag
export const removeTagFromCourseOfferingProjects = async (
  req: Request,
  res: Response,
) => {
  const { userId, isAdmin } = req.user!;
  // Validation middleware ensures these are valid
  const offeringId = parseInt(req.params.offeringId, 10);
  const { tag } = req.body;

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only admins or instructors of the course offering can remove tags',
      );
    }
  }

  const result = await removeTagService(offeringId, tag);

  return res.json({
    message: 'Tag removed successfully',
    result,
  });
};
