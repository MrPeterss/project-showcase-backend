import { prisma } from '../prisma.js';

/**
 * Get the preferred project for a team.
 * Returns the newest running project if available, otherwise the newest project regardless of status.
 * Returns null if the team has no projects.
 * @param teamId - The ID of the team
 * @param select - Optional Prisma select clause to specify which fields to return
 */
export const getTeamPreferredProject = async <T extends Record<string, unknown>>(
  teamId: number,
  select?: T,
) => {
  const baseQuery = {
    where: {
      teamId,
      status: 'running' as const,
    },
    orderBy: { deployedAt: 'desc' as const },
    ...(select && { select }),
  };

  // First, try to get the newest running project
  const runningProject = await prisma.project.findFirst(baseQuery);

  // If we found a running project, return it
  if (runningProject) {
    return runningProject;
  }

  // Otherwise, return the newest project regardless of status
  return await prisma.project.findFirst({
    where: { teamId },
    orderBy: { deployedAt: 'desc' },
    ...(select && { select }),
  });
};

