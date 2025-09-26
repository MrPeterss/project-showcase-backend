import { Router } from 'express';
import { createTeam, joinTeam } from './teamController.js';
import { authenticateFirebase } from '../middleware/authMiddleware.js';


const router = Router();
router.post('/create', authenticateFirebase, createTeam);
router.post('/join', authenticateFirebase, joinTeam);

export default router;
