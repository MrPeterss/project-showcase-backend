import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authentication.js';
import { prisma } from '../prisma.js';

export const getAllUsers = async (
  _: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};
