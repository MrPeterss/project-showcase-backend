import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authentication.js';
import { prisma } from '../prisma.js';

export const getTeam = async (req: AuthenticatedRequest, res: Response) => {
  const team = await prisma.team.findUnique({
    where: { id: req.user!.teamId! },
    include: { members: true, projects: true, course: true },
  })
  res.json(team);
};
