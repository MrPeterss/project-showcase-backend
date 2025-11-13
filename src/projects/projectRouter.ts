import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  deployProjectSchema,
  getProjectLogsSchema,
  getTeamProjectsSchema,
  stopProjectSchema,
} from './project.schema.js';
import {
  deployProject,
  deployLegacyProjectController,
  getAllImages,
  getProject,
  getProjectLogsController,
  getProjects,
  getRunningContainers,
  getTeamProjectsController,
  stopProjectController,
} from './projectController.js';

const router = Router();

// Docker info routes (admin only)
router.get('/containers', requireAdmin, getRunningContainers);
router.get('/images', requireAdmin, getAllImages);

// Project CRUD routes
router.post('/deploy', validateRequest(deployProjectSchema), deployProject);
router.post('/deploy-legacy', requireAdmin, validateRequest(deployProjectSchema), deployLegacyProjectController);
router.get('/', getProjects);
router.get('/:projectId', getProject);
router.post(
  '/:projectId/stop',
  validateRequest(stopProjectSchema),
  stopProjectController,
);

// Get logs for a specific project
router.get(
  '/:projectId/logs',
  validateRequest(getProjectLogsSchema),
  getProjectLogsController,
);

// Team-specific project routes
router.get(
  '/team/:teamId',
  validateRequest(getTeamProjectsSchema),
  getTeamProjectsController,
);

export default router;
