import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  courseParamsSchema,
  courseSchema,
} from './courses.schema.js';
import {
  createCourse,
  deleteCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
} from './courseController.js';

const router = Router();

router.get('/', requireAdmin, getAllCourses);
router.get(
  '/:courseId',
  requireAdmin,
  validateRequest(courseParamsSchema),
  getCourseById,
);
router.post('/', requireAdmin, validateRequest(courseSchema), createCourse);
router.put(
  '/:courseId',
  requireAdmin,
  validateRequest(courseParamsSchema),
  validateRequest(courseSchema),
  updateCourse,
);
router.delete(
  '/:courseId',
  requireAdmin,
  validateRequest(courseParamsSchema),
  deleteCourse,
);

export default router;
