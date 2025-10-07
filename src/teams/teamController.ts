import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';

export const listTeams = async (_req: Request, res: Response) => {
  const teams = await prisma.team.findMany();
  return res.json(teams);
};

export const getTeamById = async (req: Request, res: Response) => {
  const teamId = Number(req.params.teamId);
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  return res.json(team);
};

export const createTeam = async (req: Request, res: Response) => {
  const { name, port, courseId } = req.body;
  if (!name || !port || !courseId) {
    return res
      .status(400)
      .json({ error: 'Name, port, and courseId are required' });
  }

  try {
    const newTeam = await prisma.team.create({
      data: { name, port, courseId },
    });
    return res.status(201).json(newTeam);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  const teamId = Number(req.params.teamId);
  const { name, port, courseId } = req.body;

  try {
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { name, port, courseId },
    });
    return res.json(updatedTeam);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  const teamId = Number(req.params.teamId);

  try {
    await prisma.team.delete({
      where: { id: teamId },
    });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
