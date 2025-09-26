import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const createProject = async (req: Request, res: Response) => {
  try {
    const { dockerHubImage, teamId, deployedById } = req.body;
    const project = await prisma.project.create({
      data: {
        dockerHubImage,
        teamId,
        deployedById,
        isActive: false,
      },
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: 'Project creation failed', details: err });
  }
};

export const listProjects = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.query;
    const projects = await prisma.project.findMany({
      where: { teamId: Number(teamId) },
    });
    res.json(projects);
  } catch (err) {
    res.status(400).json({ error: 'Failed to fetch projects', details: err });
  }
};
