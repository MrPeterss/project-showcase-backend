import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const createTeam = async (req: Request, res: Response) => {
  try {
    const { name, port, courseId } = req.body;
    const team = await prisma.team.create({
      data: { name, port, courseId },
    });
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ error: 'Team creation failed', details: err });
  }
};

export const joinTeam = async (req: Request, res: Response) => {
  try {
    const { userId, teamId } = req.body;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { teamId },
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Join team failed', details: err });
  }
};
