import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // @ts-expect-error - user property is added by Firebase auth middleware
  const userId = req.user?.uid;
  if (!userId) {
    res.status(401).json({ error: 'No user' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
};

export const listUsers = async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({ include: { team: true } });
  res.json(users);
};

export const addUser = async (req: Request, res: Response) => {
  try {
    const { email, teamId, role } = req.body;
    const user = await prisma.user.create({
      data: { email, teamId, role: role || 'STUDENT' },
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
