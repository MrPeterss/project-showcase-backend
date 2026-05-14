import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  backfillTeamAliasesSchema,
  migrateProjectSchema,
  projectIdParamsSchema,
  updateUserNameSchema,
  userIdParamsSchema,
} from './admin.schema.js';
import {
  backfillTeamAliasesFromRunningProjectsHandler,
  demoteUser,
  getAllProjects,
  migrateProject,
  pruneProject,
  promoteUser,
  triggerPruning,
  updateUserName,
} from './adminController.js';
import { getStorageInfo, streamSystemStats } from './systemInfoController.js';

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

// System info (admin only; protected in server.ts)
router.get('/system/stream', streamSystemStats);
router.get('/system/storage', getStorageInfo);

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

// Project migration route
router.post(
  '/projects/migrate',
  validateRequest(migrateProjectSchema),
  migrateProject,
);

router.post(
  '/teams/backfill-aliases',
  validateRequest(backfillTeamAliasesSchema),
  backfillTeamAliasesFromRunningProjectsHandler,
);

export default router;
