import type { Request, Response } from 'express';

import { buildOldJson, buildOldSql } from './oldProjectService.js';

export const buildOldJsonController = async (req: Request, res: Response) => {
  const { teamId, githubUrl } = req.body;
  const { userId } = req.user!;

  const result = await buildOldJson(Number(teamId), githubUrl, userId);

  return res.status(201).json({
    message: 'Old project (JSON) built successfully',
    ...result,
  });
};

export const buildOldSqlController = async (req: Request, res: Response) => {
  const { teamId, githubUrl } = req.body;
  const { userId } = req.user!;

  const result = await buildOldSql(Number(teamId), githubUrl, userId);

  return res.status(201).json({
    message: 'Old project (SQL) built successfully',
    ...result,
  });
};

