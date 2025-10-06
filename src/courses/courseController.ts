import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authentication.js';
// import { prisma } from '../prisma.js';

export const getCourseProjectsById = async (_: AuthenticatedRequest, res: Response) => {
  res.json({ message: 'This endpoint will return projects for the specified course ID.' });
  // const courseId = req.params.courseId;
  // const projects = await prisma.project.findMany({
  //   where: { courseId: courseId },
  // });
  // res.json(projects);
};
