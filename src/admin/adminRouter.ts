import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  projectIdParamsSchema,
  updateUserNameSchema,
  userIdParamsSchema,
} from './admin.schema.js';
import {
  demoteUser,
  getAllProjects,
  pruneProject,
  promoteUser,
  triggerPruning,
  updateUserName,
} from './adminController.js';

const router = Router();

router.get('/stats', (_req, res) => {
  res.json({ message: 'Admin stats endpoint' });
});

router.get('/settings', (_req, res) => {
  res.json({ message: 'Admin settings endpoint' });
});

router.get('/audit-logs', (_req, res) => {
  res.json({ message: 'Admin audit logs endpoint' });
});

// Resource management route - get all non-pruned projects
router.get('/resources/projects', getAllProjects);

// Project management routes
router.post('/projects/prune', triggerPruning);
router.post(
  '/projects/:projectId/prune',
  validateRequest(projectIdParamsSchema),
  pruneProject,
);

// User admin management routes
router.post('/users/:userId/promote', promoteUser);
router.post('/users/:userId/demote', demoteUser);
router.put(
  '/users/:userId/name',
  validateRequest(userIdParamsSchema),
  validateRequest(updateUserNameSchema),
  updateUserName,
);

export default router;
