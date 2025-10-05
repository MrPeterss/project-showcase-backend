import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { getAllUsers } from './userController.js';

const router = Router();

router.get('/', requireAdmin, getAllUsers);

export default router;
