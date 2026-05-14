import { prisma } from '../prisma.js';
import {
  deriveAliasSlugFromRunningProject,
  resolveUniqueAliasSlug,
} from '../utils/teamAlias.js';
import { NotFoundError } from '../utils/AppError.js';

export const promoteUserToAdmin = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: true },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return updatedUser;
};

export const demoteUserFromAdmin = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: false },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return updatedUser;
};

export const updateUserName = async (userId: number, name: string | null) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { name },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return updatedUser;
};

export type TeamAliasBackfillItem =
  | {
      teamId: number;
      teamName: string;
      projectId: number;
      inferredBaseSlug: string;
      allocatedAlias: string;
    }
  | {
      teamId: number;
      teamName: string;
      skipped: true;
      reason: 'no_running_project' | 'undeterminable_slug';
    };

export type TeamAliasBackfillSummary = {
  dryRun: boolean;
  totals: {
    eligibleTeamsWithoutAlias: number;
    applied: number;
    skippedNoRunningProject: number;
    skippedUndeterminableSlug: number;
  };
  items: TeamAliasBackfillItem[];
};

/**
 * For teams missing `alias`, use the team's newest running project's DNS/container slug,
 * allocating numeric suffixes (`-2`, …) against `Team.alias` if needed.
 * Updates the team's running deployment row `Project.alias` to match when not dry-running.
 */
export const backfillTeamAliasesFromRunningProjects = async (options?: {
  dryRun?: boolean;
}) => {
  const dryRun = options?.dryRun === true;

  const teamsMissingAlias = await prisma.team.findMany({
    where: { alias: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const items: TeamAliasBackfillItem[] = [];
  let applied = 0;
  let skippedNoRunningProject = 0;
  let skippedUndeterminableSlug = 0;

  for (const team of teamsMissingAlias) {
    const project = await prisma.project.findFirst({
      where: { teamId: team.id, status: 'running' },
      orderBy: { deployedAt: 'desc' },
      select: { id: true, alias: true, containerName: true },
    });

    if (!project) {
      skippedNoRunningProject += 1;
      items.push({
        teamId: team.id,
        teamName: team.name,
        skipped: true,
        reason: 'no_running_project',
      });
      continue;
    }

    const inferredBaseSlug = deriveAliasSlugFromRunningProject(project);
    if (!inferredBaseSlug) {
      skippedUndeterminableSlug += 1;
      items.push({
        teamId: team.id,
        teamName: team.name,
        skipped: true,
        reason: 'undeterminable_slug',
      });
      continue;
    }

    const allocatedAlias = await resolveUniqueAliasSlug(
      prisma,
      inferredBaseSlug,
      team.id,
    );

    if (!dryRun) {
      await prisma.team.update({
        where: { id: team.id },
        data: { alias: allocatedAlias },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { alias: allocatedAlias },
      });
    }

    applied += 1;
    items.push({
      teamId: team.id,
      teamName: team.name,
      projectId: project.id,
      inferredBaseSlug,
      allocatedAlias,
    });
  }

  const summary: TeamAliasBackfillSummary = {
    dryRun,
    totals: {
      eligibleTeamsWithoutAlias: teamsMissingAlias.length,
      applied,
      skippedNoRunningProject,
      skippedUndeterminableSlug,
    },
    items,
  };

  return summary;
};
