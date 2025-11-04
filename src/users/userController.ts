import { prisma } from '../prisma.js';
import type { Request, Response } from 'express';
import { NotFoundError } from '../utils/AppError.js';

export const getMe = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return res.json(user);
};
