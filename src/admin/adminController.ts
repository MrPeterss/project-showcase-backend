import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // @ts-expect-error - user property is added by Firebase auth middleware
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'No user' });
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user || !user.isAdmin)
    return res.status(403).json({ error: 'Admin only' });
  next();
};

export const listUsers = async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({ include: { team: true } });
  res.json(users);
};

export const addUser = async (req: Request, res: Response) => {
  try {
    const { email, teamId, isAdmin } = req.body;
    const user = await prisma.user.create({
      data: { email, teamId, isAdmin: !!isAdmin },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: 'User creation failed', details: err });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'User deletion failed', details: err });
  }
};
