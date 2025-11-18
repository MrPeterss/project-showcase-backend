import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  deployProjectSchema,
  getTeamProjectsSchema,
  stopProjectSchema,
  streamProjectLogsSchema,
  streamBuildLogsSchema,
} from './project.schema.js';
import {
  deployProject,
  getProject,
  getProjects,
  getTeamProjectsController,
  stopProjectController,
  streamProjectLogsController,
  streamBuildLogsController,
  deployProjectWithStreamingController,
} from './projectController.js';

// Configure multer for file uploads
const uploadDir = '/tmp/project-data-files';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename with timestamp and original name
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

const router = Router();

// Project CRUD routes
router.post(
  '/deploy',
  upload.single('dataFile'),
  validateRequest(deployProjectSchema),
  deployProject,
);
router.post(
  '/deploy-streaming',
  upload.single('dataFile'),
  validateRequest(deployProjectSchema),
  deployProjectWithStreamingController,
);
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

// Stream build logs for a specific project
router.get(
  '/:projectId/build-logs',
  validateRequest(streamBuildLogsSchema),
  streamBuildLogsController,
);

// Team-specific project routes
router.get(
  '/team/:teamId',
  validateRequest(getTeamProjectsSchema),
  getTeamProjectsController,
);

export default router;
