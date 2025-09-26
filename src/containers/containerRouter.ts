import { Router } from 'express';
import { startContainer, stopContainer } from './containerController.js';
import { authenticateFirebase } from '../middleware/authentication.js';

const router = Router();

router.post('/start', authenticateFirebase, startContainer);
router.post('/stop', authenticateFirebase, stopContainer);

export default router;
