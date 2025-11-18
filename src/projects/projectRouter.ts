import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  deployProjectSchema,
  getTeamProjectsSchema,
  stopProjectSchema,
  streamProjectLogsSchema,
} from './project.schema.js';
import {
  deployProject,
  getProject,
  getProjects,
  getTeamProjectsController,
  stopProjectController,
  streamProjectLogsController,
} from './projectController.js';

const router = Router();

// Project CRUD routes
router.post('/deploy', validateRequest(deployProjectSchema), deployProject);
router.get('/', getProjects);
router.get('/:projectId', getProject);
router.post(
  '/:projectId/stop',
  validateRequest(stopProjectSchema),
  stopProjectController,
);


// Stream logs for a specific project
router.get(
  '/:projectId/logs',
  validateRequest(streamProjectLogsSchema),
  streamProjectLogsController,
);

// Team-specific project routes
router.get(
  '/team/:teamId',
  validateRequest(getTeamProjectsSchema),
  getTeamProjectsController,
);

export default router;
