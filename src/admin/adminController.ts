import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authentication.js';
import { prisma } from '../prisma.js';

export const listUsers = async (_: AuthenticatedRequest, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
};
