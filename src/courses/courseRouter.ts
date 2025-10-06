import { Router } from 'express';

import { getCourseProjectsById } from './courseController.js';

const router = Router();

router.get('/:courseId/projects', getCourseProjectsById);

export default router;
