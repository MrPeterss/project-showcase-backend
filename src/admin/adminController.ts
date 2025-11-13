import type { Request, Response } from 'express';

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
