import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { listUsers } from './userController.js';

const router = Router();

router.get('/users', requireAdmin, listUsers);

export default router;
