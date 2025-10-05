import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';

export const listUsers = async (_: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
};
