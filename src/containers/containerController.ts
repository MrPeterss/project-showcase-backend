import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
// import Docker from 'dockerode'; // Uncomment if using dockerode
// const docker = new Docker();

export const startContainer = async (req: Request, res: Response) => {
  try {
    const { projectId, containerId } = req.body;
    // Here you would use Dockerode or similar to start the container
    // Update the project with container info
    const instance = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'running',
        containerId,
      },
    });
    res.status(201).json(instance);
  } catch (err) {
    res.status(400).json({ error: 'Failed to start container', details: err });
  }
};

export const stopContainer = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    // Here you would use Dockerode or similar to stop the container
    const instance = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
      },
    });
    res.json(instance);
  } catch (err) {
    res.status(400).json({ error: 'Failed to stop container', details: err });
  }
};
