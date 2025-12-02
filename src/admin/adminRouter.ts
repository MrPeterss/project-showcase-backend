import { Router } from 'express';

import {
  demoteUser,
  getContainersByTeam,
  getDataFilesByTeam,
  getImagesWithProjects,
  promoteUser,
  triggerPruning,
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

// Resource management routes (organized by resource type)
router.get('/resources/images', getImagesWithProjects);
router.get('/resources/containers', getContainersByTeam);
router.get('/resources/data-files', getDataFilesByTeam);

// Project management routes
router.post('/projects/prune', triggerPruning);

// User admin management routes
router.post('/users/:userId/promote', promoteUser);
router.post('/users/:userId/demote', demoteUser);

export default router;
