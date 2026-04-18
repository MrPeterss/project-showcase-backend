import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  getKeyStats,
  getKeys,
  getKeysStats,
  issueKeys,
  revokeKey,
} from './sparkController.js';
import {
  issueSparkKeysSchema,
  sparkKeyParamsSchema,
  sparkOfferingParamsSchema,
} from './spark.schema.js';

// mergeParams: true so that :offeringId from the parent courseOfferingRouter is available
const router = Router({ mergeParams: true });

router.post('/keys', validateRequest(issueSparkKeysSchema), issueKeys);

router.get('/keys', validateRequest(sparkOfferingParamsSchema), getKeys);

router.get('/keys/stats', validateRequest(sparkOfferingParamsSchema), getKeysStats);

router.delete(
  '/keys/:sparkKeyId',
  validateRequest(sparkKeyParamsSchema),
  revokeKey,
);

router.get(
  '/keys/:sparkKeyId/stats',
  validateRequest(sparkKeyParamsSchema),
  getKeyStats,
);

export default router;
