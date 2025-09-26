import { Router } from 'express';
import { getAllUsers, getProtectedData } from './userController.js';
import { authenticateFirebase } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', getAllUsers);
router.get('/protected-data', authenticateFirebase, getProtectedData);

export default router;
