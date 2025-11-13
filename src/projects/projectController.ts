import type { Request, Response } from 'express';

import {
  deploy,
  listAllImages,
  listRunningContainers,
} from './projectService.js';

export const getRunningContainers = async (_req: Request, res: Response) => {
  const containers = await listRunningContainers();
  return res.json({ containers });
};

export const getAllImages = async (_req: Request, res: Response) => {
  const images = await listAllImages();
  return res.json({ images });
};

export const deployProject = async (req: Request, res: Response) => {
  const { githubUrl } = req.body;

  const result = await deploy(githubUrl);

  return res.status(201).json({
    message: 'Project deployed successfully',
    ...result,
  });
};
