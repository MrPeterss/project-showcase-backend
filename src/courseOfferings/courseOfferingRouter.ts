import { Router } from 'express';

import {
  getAllCourseOfferings,
  getCourseOffering,
  createCourseOffering,
  updateCourseOffering,
  deleteCourseOffering,
} from './courseOfferingController.js';

import {
  getCourseOfferingEnrollments,
  createCourseOfferingEnrollments,
  updateCourseOfferingEnrollment,
  deleteCourseOfferingEnrollment,
} from '../enrollment/enrollmentController.js';

import {
  getCourseOfferingTeams,
  createTeam,
} from '../teams/teamController.js';

import { validateRequest } from '../middleware/validateRequest.js';
import { requireAdmin } from '../middleware/authentication.js';

import {
  createCourseOfferingSchema,
  updateCourseOfferingSchema,
  courseOfferingParamsSchema,
  courseOfferingQuerySchema,
} from './courseOffering.schema.js';

import {
  createEnrollmentsSchema,
  updateEnrollmentSchema,
  enrollmentParamsSchema,
} from '../enrollment/enrollment.schema.js';

import {
  createTeamSchema,
  courseOfferingTeamsParamsSchema,
} from '../teams/team.schema.js';

const router = Router();

// Course offering routes
router.get(
  '/',
  validateRequest(courseOfferingQuerySchema),
  getAllCourseOfferings
);

router.get(
  '/:offeringId',
  validateRequest(courseOfferingParamsSchema),
  getCourseOffering
);

router.post(
  '/',
  requireAdmin,
  validateRequest(createCourseOfferingSchema),
  createCourseOffering
);

router.put(
  '/:offeringId',
  validateRequest(courseOfferingParamsSchema),
  validateRequest(updateCourseOfferingSchema),
  updateCourseOffering
);

router.delete(
  '/:offeringId',
  requireAdmin,
  validateRequest(courseOfferingParamsSchema),
  deleteCourseOffering
);

// Enrollment routes
router.get(
  '/:offeringId/enrollments',
  validateRequest(courseOfferingParamsSchema),
  getCourseOfferingEnrollments
);

router.post(
  '/:offeringId/enrollments',
  validateRequest(courseOfferingParamsSchema),
  validateRequest(createEnrollmentsSchema),
  createCourseOfferingEnrollments
);

router.put(
  '/:offeringId/enrollments/:userId',
  validateRequest(enrollmentParamsSchema),
  validateRequest(updateEnrollmentSchema),
  updateCourseOfferingEnrollment
);

router.delete(
  '/:offeringId/enrollments/:userId',
  validateRequest(enrollmentParamsSchema),
  deleteCourseOfferingEnrollment
);

// Team routes nested under course offerings
router.get(
  '/:offeringId/teams',
  validateRequest(courseOfferingTeamsParamsSchema),
  getCourseOfferingTeams
);

router.post(
  '/:offeringId/teams',
  validateRequest(courseOfferingTeamsParamsSchema),
  validateRequest(createTeamSchema),
  createTeam
);

export default router;
