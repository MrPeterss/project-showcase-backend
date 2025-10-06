import { Router } from 'express';

import { refreshAccessToken, verifyFirebaseToken } from './authController.js';

const router = Router();

router.post('/verify-token', verifyFirebaseToken);
router.post('/refresh-token', refreshAccessToken);

export default router;
