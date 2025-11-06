import { Router } from 'express';

import { getAllSemesters, createSemester, updateSemester, deleteSemester } from './semesterController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAdmin } from '../middleware/authentication.js';
import { semesterSchema } from './semester.schema.js';

const router = Router();

router.get('/', requireAdmin, getAllSemesters);
router.post('/', requireAdmin, validateRequest(semesterSchema), createSemester);
router.put('/:semesterId', requireAdmin, validateRequest(semesterSchema), updateSemester);
router.delete('/:semesterId', requireAdmin, deleteSemester);

export default router;
