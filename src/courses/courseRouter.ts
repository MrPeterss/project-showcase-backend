import { Router } from 'express';

import { getAllCourses, createCourse, updateCourse, deleteCourse } from './courseController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAdmin } from '../middleware/authentication.js';
import { courseSchema } from './courses.schema.js';

const router = Router();

router.get('/courses', requireAdmin, getAllCourses);
router.post('/courses', requireAdmin, validateRequest(courseSchema), createCourse);
router.put('/courses/:id', requireAdmin, validateRequest(courseSchema), updateCourse);
router.delete('/courses/:id', requireAdmin, deleteCourse);

export default router;
