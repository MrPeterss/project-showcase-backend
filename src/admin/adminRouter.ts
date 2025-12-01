import { Router } from 'express';

import { getAllImages, getRunningContainers } from '../projects/projectController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  containerIdParamsSchema,
  fileNameParamsSchema,
  imageIdParamsSchema,
} from './admin.schema.js';
import {
  demoteUser,
  getAllDataFiles,
  getAllDockerContainers,
  getAllDockerImages,
  promoteUser,
  removeContainer,
  removeDataFile,
  removeImage,
  stopContainer,
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

// Docker info routes
router.get('/projects/containers', getRunningContainers);
router.get('/docker/containers', getAllDockerContainers);
router.get('/projects/images', getAllImages);
router.get('/docker/images', getAllDockerImages);

// Docker management routes
router.post(
  '/docker/containers/:containerId/stop',
  validateRequest(containerIdParamsSchema),
  stopContainer,
);
router.delete(
  '/docker/containers/:containerId',
  validateRequest(containerIdParamsSchema),
  removeContainer,
);
router.delete(
  '/docker/images/:imageId',
  validateRequest(imageIdParamsSchema),
  removeImage,
);

// Data files routes
router.get('/data-files', getAllDataFiles);
router.delete(
  '/data-files/:fileName',
  validateRequest(fileNameParamsSchema),
  removeDataFile,
);

// Project management routes
router.post('/projects/prune', triggerPruning);

// User admin management routes
router.post('/users/:userId/promote', promoteUser);
router.post('/users/:userId/demote', demoteUser);

export default router;
