import { Router } from 'express';

import {
  getCourseOfferingEnrollments,
  createCourseOfferingEnrollments,
  updateCourseOfferingEnrollment,
  deleteCourseOfferingEnrollment,
} from './enrollmentController.js';

import { validateRequest } from '../middleware/validateRequest.js';

import {
  createEnrollmentsSchema,
  updateEnrollmentSchema,
} from './enrollment.schema.js';

const router = Router();

// All enrollment routes are nested under course offerings
// These routes handle /course-offerings/:offeringId/enrollments

router.get(
  '/',
  getCourseOfferingEnrollments
);

router.post(
  '/',
  validateRequest(createEnrollmentsSchema),
  createCourseOfferingEnrollments
);

router.put(
  '/:userId',
  validateRequest(updateEnrollmentSchema),
  updateCourseOfferingEnrollment
);

router.delete(
  '/:userId',
  deleteCourseOfferingEnrollment
);

export default router;