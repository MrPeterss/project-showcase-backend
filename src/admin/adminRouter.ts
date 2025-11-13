import { Router } from 'express';

import { requireAdmin } from '../middleware/authentication.js';
import { getAllImages, getRunningContainers } from '../projects/projectController.js';

const router = Router();

router.get('/stats', requireAdmin, (_req, res) => {
  res.json({ message: 'Admin stats endpoint' });
});

router.get('/settings', requireAdmin, (_req, res) => {
  res.json({ message: 'Admin settings endpoint' });
});

router.get('/audit-logs', requireAdmin, (_req, res) => {
  res.json({ message: 'Admin audit logs endpoint' });
});

// Docker info routes
router.get('/containers', requireAdmin, getRunningContainers);
router.get('/images', requireAdmin, getAllImages);

export default router;
