import { Router } from 'express';

import { getTeam } from './teamController.js';

const router = Router();

router.get('/me', getTeam);

export default router;
