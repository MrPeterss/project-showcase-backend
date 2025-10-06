import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';

export const getCurrentUserProfile = async (req: Request, res: Response) => {
  const userId = Number(req.user?.userId);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      team: true,
      projectsCreated: true,
      createdAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json(user);
};

export const listUsers = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  return res.json(users);
};

export const getUserById = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json(user);
};

export const createUser = async (req: Request, res: Response) => {
  const { email, role, teamId } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  try {
    const newUser = await prisma.user.create({
      data: { email, role, teamId },
    });
    return res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error creating user' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const { email, role, teamId } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { email, role, teamId },
    });
    return res.json(updatedUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error updating user' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);

  try {
    await prisma.user.delete({
      where: { id: userId },
    });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error deleting user' });
  }
};
