import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import {
  createUser,
  deleteUser,
  getCurrentUserProfile,
  getUserById,
  listUsers,
  updateUser,
} from './userController.js';

const router = Router();

// Get current user's profile
router.get('/me', getCurrentUserProfile);

// Admin CRUD routes
router.get('/', requireAdmin, listUsers);
router.get('/:userId', requireAdmin, getUserById);
router.post('/', requireAdmin, createUser);
router.put('/:userId', requireAdmin, updateUser);
router.delete('/:userId', requireAdmin, deleteUser);

export default router;
