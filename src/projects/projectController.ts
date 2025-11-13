import type { Request, Response } from 'express';

import {
  deploy,
  getAllProjects,
  getProjectById,
  getProjectLogs,
  getTeamProjects,
  listAllImages,
  listRunningContainers,
  stopProject,
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
  const { teamId, githubUrl } = req.body;

  const result = await deploy(teamId, githubUrl);

  return res.status(201).json({
    message: 'Project deployed successfully',
    ...result,
  });
};

export const getProjects = async (_req: Request, res: Response) => {
  const projects = await getAllProjects();
  return res.json({ projects });
};

export const getTeamProjectsController = async (
  req: Request,
  res: Response,
) => {
  const { teamId } = req.params;
  const projects = await getTeamProjects(Number(teamId));
  return res.json({ projects });
};

export const getProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = await getProjectById(Number(projectId));
  return res.json({ project });
};

export const stopProjectController = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = await stopProject(Number(projectId));
  return res.json({
    message: 'Project stopped successfully',
    project,
  });
};

export const getProjectLogsController = async (
  req: Request,
  res: Response,
) => {
  const { projectId } = req.params;
  const { tail, since, timestamps } = req.query;

  const logsData = await getProjectLogs(Number(projectId), {
    tail: tail ? Number(tail) : undefined,
    since: since as string | undefined,
    timestamps: timestamps === 'true',
  });

  return res.json(logsData);
};
