import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import {
  createCourse,
  deleteCourse,
  getCourseById,
  listCourses,
  updateCourse,
} from './courseController.js';

const router = Router();

// Admin CRUD routes
router.get('/', requireAdmin, listCourses);
router.get('/:courseId', requireAdmin, getCourseById);
router.post('/', requireAdmin, createCourse);
router.put('/:courseId', requireAdmin, updateCourse);
router.delete('/:courseId', requireAdmin, deleteCourse);

export default router;
