import { Router } from 'express';
import { startContainer, stopContainer } from './containerController';
import { authenticateFirebase } from '../middleware/authMiddleware';

const router = Router();

router.post('/start', authenticateFirebase, startContainer);
router.post('/stop', authenticateFirebase, stopContainer);

export default router;
