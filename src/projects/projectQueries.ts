import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';

export const getTeamProjects = async (teamId: number) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const projects = await prisma.project.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          hallOfFame: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return projects;
};

export const getProjectById = async (projectId: number) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          hallOfFame: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
};

export const getAllProjects = async () => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          hallOfFame: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return projects;
};
