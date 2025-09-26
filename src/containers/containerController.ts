import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma/client';
// import Docker from 'dockerode'; // Uncomment if using dockerode

const prisma = new PrismaClient();
// const docker = new Docker();

export const startContainer = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    // Here you would use Dockerode or similar to start the container
    // For now, just create a ContainerInstance record
    const instance = await prisma.containerInstance.create({
      data: {
        projectId,
        status: 'running',
        // containerId: dockerId,
        // url: publicUrl,
      },
    });
    res.status(201).json(instance);
  } catch (err) {
    res.status(400).json({ error: 'Failed to start container', details: err });
  }
};

export const stopContainer = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;
    // Here you would use Dockerode or similar to stop the container
    const instance = await prisma.containerInstance.update({
      where: { id: instanceId },
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
