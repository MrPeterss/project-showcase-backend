import { Router } from 'express';
import { listUsers, addUser, deleteUser, requireAdmin } from './adminController';
import { authenticateFirebase } from '../middleware/authMiddleware';

const router = Router();

router.get('/users', authenticateFirebase, requireAdmin, listUsers);
router.post('/users', authenticateFirebase, requireAdmin, addUser);
router.delete('/users/:id', authenticateFirebase, requireAdmin, deleteUser);

export default router;
