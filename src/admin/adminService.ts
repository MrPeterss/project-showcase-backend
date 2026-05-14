import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';
import {
  baseTeamAliasFromName,
  deriveAliasSlugFromRunningProject,
  resolveUniqueAliasSlug,
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
  /** Whether we started from Docker/persisted project slug vs team display name. */
  source: 'running_project' | 'team_name';
  /** Candidate base slug before uniqueness (`-2`, …); sanitized. */
  basisSlug: string;
  allocatedAlias: string;
  /** Running project synced when applicable; otherwise null (no active container row). */
  syncedRunningProjectId: number | null;
};

export type TeamAliasBackfillSummary = {
  dryRun: boolean;
  totals: {
    eligibleTeamsWithoutAlias: number;
    applied: number;
    fromRunningProject: number;
    fromTeamName: number;
  };
  items: TeamAliasBackfillItem[];
};

/**
 * Assign `Team.alias` when null: prefer slug from newest **running** `Project`
 * (`alias` then `containerName`), falling back to the same sanitized team-name rules as create/rename.
 * Uniqueness uses global `Team.alias` plus `-2`, `-3`, … (and optional dry-run batch simulation).
 *
 * Writes `Project.alias` on the running deployment row when present so it matches the chosen alias.
 */
export const backfillTeamAliasesFromRunningProjects = async (options?: {
  dryRun?: boolean;
}) => {
  const dryRun = options?.dryRun === true;
  const simulatedTaken = dryRun ? new Set<string>() : undefined;

  const teamsMissingAlias = await prisma.team.findMany({
    where: { alias: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const items: TeamAliasBackfillItem[] = [];
  let fromRunningProject = 0;
  let fromTeamName = 0;

  for (const team of teamsMissingAlias) {
    const runningProject = await prisma.project.findFirst({
      where: { teamId: team.id, status: 'running' },
      orderBy: { deployedAt: 'desc' },
      select: { id: true, alias: true, containerName: true },
    });

    let allocatedAlias: string;
    let source: TeamAliasBackfillItem['source'];
    let basisSlug: string;

    const nameBasis = baseTeamAliasFromName(team.name);

    if (runningProject) {
      const fromDocker = deriveAliasSlugFromRunningProject(runningProject);
      if (fromDocker) {
        basisSlug = fromDocker;
        source = 'running_project';
        allocatedAlias = await resolveUniqueAliasSlug(
          prisma,
          fromDocker,
          team.id,
          simulatedTaken,
        );
        fromRunningProject += 1;
      } else {
        basisSlug = nameBasis;
        source = 'team_name';
        allocatedAlias = await resolveUniqueTeamAlias(
          prisma,
          team.name,
          team.id,
          simulatedTaken,
        );
        fromTeamName += 1;
      }
    } else {
      basisSlug = nameBasis;
      source = 'team_name';
      allocatedAlias = await resolveUniqueTeamAlias(
        prisma,
        team.name,
        team.id,
        simulatedTaken,
      );
      fromTeamName += 1;
    }

    simulatedTaken?.add(allocatedAlias);

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
      source,
      basisSlug,
      allocatedAlias,
      syncedRunningProjectId: runningProject?.id ?? null,
    });
  }

  return {
    dryRun,
    totals: {
      eligibleTeamsWithoutAlias: teamsMissingAlias.length,
      applied: teamsMissingAlias.length,
      fromRunningProject,
      fromTeamName,
    },
    items,
  } satisfies TeamAliasBackfillSummary;
};
