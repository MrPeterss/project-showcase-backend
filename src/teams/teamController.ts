import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

export const createTeam = async (req: Request, res: Response) => {
  try {
    const { name, port } = req.body;
    const team = await prisma.team.create({
      data: { name, port },
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
