import { Router } from 'express';

import { getAllSemesters, createSemester, updateSemester, deleteSemester } from './semesterController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAdmin } from '../middleware/authentication.js';
import { semesterSchema } from './semester.schema.js';

const router = Router();

router.get('/semesters', requireAdmin, getAllSemesters);
router.post('/semesters', requireAdmin, validateRequest(semesterSchema), createSemester);
router.put('/semesters/:id', requireAdmin, validateRequest(semesterSchema), updateSemester);
router.delete('/semesters/:id', requireAdmin, deleteSemester);

export default router;
