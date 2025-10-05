import { Router } from 'express';
import { getAllUsers, getProtectedData } from './userController.js';
import { authenticateUser, getCurrentUser } from './authController.js';
import { authenticateFirebase } from '../middleware/authentication.js';

const router = Router();

router.get('/', getAllUsers);
router.get('/protected-data', authenticateFirebase, getProtectedData);

// Authentication endpoints
router.post('/auth', authenticateFirebase, authenticateUser);
router.get('/me', authenticateFirebase, getCurrentUser);

export default router;
