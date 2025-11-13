import { Router } from 'express';

import { getAllImages, getRunningContainers } from '../projects/projectController.js';
import { demoteUser, promoteUser } from './adminController.js';

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

// Docker info routes
router.get('/containers', getRunningContainers);
router.get('/images', getAllImages);

// User admin management routes
router.post('/users/:userId/promote', promoteUser);
router.post('/users/:userId/demote', demoteUser);

export default router;
