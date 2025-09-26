import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const updateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { dockerHubImage, isActive } = req.body;
    const project = await prisma.project.update({
      where: { id: Number(id) },
      data: { dockerHubImage, isActive },
    });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: 'Project update failed', details: err });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.project.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Project deletion failed', details: err });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: Number(id) },
    });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: 'Failed to fetch project', details: err });
  }
};

export const getProjectLogs = async (req: Request, res: Response) => {
  // Placeholder: Integrate with Docker/container logs in the future
  res.json({ logs: 'Project logs not implemented yet.' });
};

export const restartProject = async (req: Request, res: Response) => {
  // Placeholder: Integrate with Docker restart logic in the future
  res.json({ status: 'Restart not implemented yet.' });
};
