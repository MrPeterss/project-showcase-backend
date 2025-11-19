import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { buildOldProjectSchema } from './oldProject.schema.js';
import {
  buildOldJsonController,
  buildOldSqlController,
} from './oldProjectController.js';

const router = Router();

router.post(
  '/build-old-json',
  requireAdmin,
  validateRequest(buildOldProjectSchema),
  buildOldJsonController,
);

router.post(
  '/build-old-sql',
  requireAdmin,
  validateRequest(buildOldProjectSchema),
  buildOldSqlController,
);

export default router;

