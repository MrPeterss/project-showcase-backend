import { Router } from 'express';

import { getAllCourses, createCourse, updateCourse, deleteCourse } from './courseController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAdmin } from '../middleware/authentication.js';
import { courseSchema } from './courses.schema.js';

const router = Router();

router.get('/', requireAdmin, getAllCourses);
router.post('/', requireAdmin, validateRequest(courseSchema), createCourse);
router.put('/:courseId', requireAdmin, validateRequest(courseSchema), updateCourse);
router.delete('/:courseId', requireAdmin, deleteCourse);

export default router;
