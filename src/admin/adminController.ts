import type { Request, Response } from 'express';

import { pruneUntaggedProjects } from '../projects/containerMonitor.js';
import * as adminService from './adminService.js';

export const promoteUser = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  
  const updatedUser = await adminService.promoteUserToAdmin(userId);
  
  return res.json({
    message: 'User promoted to admin successfully',
    user: updatedUser,
  });
};

export const demoteUser = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  
  const updatedUser = await adminService.demoteUserFromAdmin(userId);
  
  return res.json({
    message: 'User demoted from admin successfully',
    user: updatedUser,
  });
};

export const triggerPruning = async (_req: Request, res: Response) => {
  try {
    const result = await pruneUntaggedProjects();
    
    return res.json({
      message: 'Project pruning completed',
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to prune projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
