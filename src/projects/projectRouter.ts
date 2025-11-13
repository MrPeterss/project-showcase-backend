import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { deployProjectSchema } from './project.schema.js';
import {
  deployProject,
  getAllImages,
  getRunningContainers,
} from './projectController.js';

const router = Router();

router.get('/containers', requireAdmin, getRunningContainers);
router.get('/images', requireAdmin, getAllImages);
router.post('/deploy', validateRequest(deployProjectSchema), deployProject);

export default router;
