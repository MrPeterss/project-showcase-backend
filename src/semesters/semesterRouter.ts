import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import {
  createSemester,
  deleteSemester,
  getSemesterById,
  listSemesters,
  updateSemester,
} from './semesterController.js';

const router = Router();

// Admin CRUD routes
router.get('/', requireAdmin, listSemesters);
router.get('/:semesterId', requireAdmin, getSemesterById);
router.post('/', requireAdmin, createSemester);
router.put('/:semesterId', requireAdmin, updateSemester);
router.delete('/:semesterId', requireAdmin, deleteSemester);

export default router;
