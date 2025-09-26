import { Router } from 'express';
import { createProject, listProjects } from './projectController';
import {
	updateProject,
	deleteProject,
	getProject,
	getProjectLogs,
	restartProject
} from './projectLifecycleController';
import { authenticateFirebase } from '../middleware/authMiddleware';


const router = Router();

router.post('/create', authenticateFirebase, createProject);
router.get('/list', authenticateFirebase, listProjects);
router.get('/:id', authenticateFirebase, getProject);
router.put('/:id', authenticateFirebase, updateProject);
router.delete('/:id', authenticateFirebase, deleteProject);
router.get('/:id/logs', authenticateFirebase, getProjectLogs);
router.post('/:id/restart', authenticateFirebase, restartProject);

export default router;
