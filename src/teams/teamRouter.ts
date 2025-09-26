import { Router } from 'express';
import { createTeam, joinTeam } from './teamController';
import { authenticateFirebase } from '../middleware/authMiddleware';


const router = Router();
router.post('/create', authenticateFirebase, createTeam);
router.post('/join', authenticateFirebase, joinTeam);

export default router;
