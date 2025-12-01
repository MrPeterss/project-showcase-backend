import { Router } from 'express';

import {
  createEnrollmentsSchema,
  enrollmentParamsSchema,
  updateEnrollmentSchema,
} from '../enrollment/enrollment.schema.js';
import {
  createCourseOfferingEnrollments,
  deleteCourseOfferingEnrollment,
  getCourseOfferingEnrollments,
  updateCourseOfferingEnrollment,
} from '../enrollment/enrollmentController.js';
import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  courseOfferingTeamsParamsSchema,
  createTeamSchema,
} from '../teams/team.schema.js';
import {
  createTeam,
  getCourseOfferingTeams,
  getMyTeamsInOffering,
} from '../teams/teamController.js';
import {
  courseOfferingParamsSchema,
  courseOfferingQuerySchema,
  createCourseOfferingSchema,
  tagCourseOfferingProjectsSchema,
  updateCourseOfferingSchema,
} from './courseOffering.schema.js';
import {
  createCourseOffering,
  deleteCourseOffering,
  getAllCourseOfferings,
  getCourseOffering,
  tagCourseOfferingProjects,
  updateCourseOffering,
} from './courseOfferingController.js';

const router = Router();

// Course offering routes
router.get(
  '/',
  validateRequest(courseOfferingQuerySchema),
  getAllCourseOfferings,
);

router.get(
  '/:offeringId',
  validateRequest(courseOfferingParamsSchema),
  getCourseOffering,
);

router.post(
  '/',
  requireAdmin,
  validateRequest(createCourseOfferingSchema),
  createCourseOffering,
);

router.put(
  '/:offeringId',
  validateRequest(courseOfferingParamsSchema),
  validateRequest(updateCourseOfferingSchema),
  updateCourseOffering,
);

router.delete(
  '/:offeringId',
  requireAdmin,
  validateRequest(courseOfferingParamsSchema),
  deleteCourseOffering,
);

// Enrollment routes
router.get(
  '/:offeringId/enrollments',
  validateRequest(courseOfferingParamsSchema),
  getCourseOfferingEnrollments,
);

router.post(
  '/:offeringId/enrollments',
  validateRequest(courseOfferingParamsSchema),
  validateRequest(createEnrollmentsSchema),
  createCourseOfferingEnrollments,
);

router.put(
  '/:offeringId/enrollments/:userId',
  validateRequest(enrollmentParamsSchema),
  validateRequest(updateEnrollmentSchema),
  updateCourseOfferingEnrollment,
);

router.delete(
  '/:offeringId/enrollments/:userId',
  validateRequest(enrollmentParamsSchema),
  deleteCourseOfferingEnrollment,
);

// Team routes nested under course offerings
router.get(
  '/:offeringId/teams',
  validateRequest(courseOfferingTeamsParamsSchema),
  getCourseOfferingTeams,
);

router.post(
  '/:offeringId/teams',
  validateRequest(courseOfferingTeamsParamsSchema),
  validateRequest(createTeamSchema),
  createTeam,
);

router.get(
  '/:offeringId/teams/me',
  validateRequest(courseOfferingTeamsParamsSchema),
  getMyTeamsInOffering,
);

// Project tagging route (admin or instructor)
router.post(
  '/:offeringId/projects/tag',
  validateRequest(tagCourseOfferingProjectsSchema),
  tagCourseOfferingProjects,
);

export default router;
