import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import {
  createTeam,
  deleteTeam,
  getTeamById,
  listTeams,
  updateTeam,
} from './teamController.js';

const router = Router();

router.get('/', listTeams);
router.get('/:teamId', getTeamById);
router.post('/', requireAdmin, createTeam);
router.put('/:teamId', requireAdmin, updateTeam);
router.delete('/:teamId', requireAdmin, deleteTeam);

export default router;
