import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';

import { requireAdmin } from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { buildOldProjectSchema } from '../oldProjects/oldProject.schema.js';
import {
  buildOldJsonController,
  buildOldSqlController,
} from '../oldProjects/oldProjectController.js';
import {
  deployProjectSchema,
  getTeamProjectsSchema,
  stopProjectSchema,
  streamProjectLogsSchema,
  streamBuildLogsSchema,
  redeployProjectSchema,
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
  redeployProjectController,
} from './projectController.js';

// Configure multer for file uploads
// Use a path that will be mounted as a volume from the host
const uploadDir = process.env.DATA_FILES_DIR || '/app/data/project-data-files';
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

// Redeploy an existing project using its stored image and data
router.post(
  '/:projectId/redeploy',
  validateRequest(redeployProjectSchema),
  redeployProjectController,
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

// Old project build routes
router.post(
  '/build-old-json',
  requireAdmin,
  validateRequest(buildOldProjectSchema),
  buildOldJsonController,
);

router.post(
  '/build-old-sql',
  requireAdmin,
  validateRequest(buildOldProjectSchema),
  buildOldSqlController,
);

export default router;
