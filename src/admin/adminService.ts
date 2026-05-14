import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';
import {
  baseTeamAliasFromName,
  resolveUniqueTeamAlias,
} from '../utils/teamAlias.js';

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

export type TeamAliasBackfillItem = {
  teamId: number;
  teamName: string;
  /** Same base slug as {@link resolveUniqueTeamAlias} / create & rename flows. */
  nameBaseSlug: string;
  allocatedAlias: string;
  /** Latest running project `id` whose `alias` row was synced, when any; otherwise null. */
  syncedRunningProjectId: number | null;
};

export type TeamAliasBackfillSummary = {
  dryRun: boolean;
  totals: {
    eligibleTeamsWithoutAlias: number;
    applied: number;
  };
  items: TeamAliasBackfillItem[];
};

/**
 * Assign `Team.alias` for rows where it is still null using the same rules as `createTeamWithMembers`
 * / `updateTeamWithMembers` (sanitized display name plus `-2`, `-3`, … global uniqueness).
 * If the team has a running deployment, `Project.alias` for that row is set to match.
 *
 * Dry run: allocates without writing DB; simulates collisions within this batch via an in-memory set
 * alongside existing `Team.alias` rows in the database.
 */
export const backfillTeamAliasesFromRunningProjects = async (options?: {
  dryRun?: boolean;
}) => {
  const dryRun = options?.dryRun === true;
  /** Simulates uniqueness within this batch while `dryRun` (no commits yet). */
  const simulatedTaken = dryRun ? new Set<string>() : undefined;

  const teamsMissingAlias = await prisma.team.findMany({
    where: { alias: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const items: TeamAliasBackfillItem[] = [];

  for (const team of teamsMissingAlias) {
    const nameBaseSlug = baseTeamAliasFromName(team.name);
    const allocatedAlias = await resolveUniqueTeamAlias(
      prisma,
      team.name,
      team.id,
      simulatedTaken,
    );
    simulatedTaken?.add(allocatedAlias);

    const runningProject = await prisma.project.findFirst({
      where: { teamId: team.id, status: 'running' },
      orderBy: { deployedAt: 'desc' },
      select: { id: true },
    });

    if (!dryRun) {
      await prisma.team.update({
        where: { id: team.id },
        data: { alias: allocatedAlias },
      });
      if (runningProject) {
        await prisma.project.update({
          where: { id: runningProject.id },
          data: { alias: allocatedAlias },
        });
      }
    }

    items.push({
      teamId: team.id,
      teamName: team.name,
      nameBaseSlug,
      allocatedAlias,
      syncedRunningProjectId: runningProject?.id ?? null,
    });
  }

  const summary: TeamAliasBackfillSummary = {
    dryRun,
    totals: {
      eligibleTeamsWithoutAlias: teamsMissingAlias.length,
      applied: teamsMissingAlias.length,
    },
    items,
  };

  return summary;
};
