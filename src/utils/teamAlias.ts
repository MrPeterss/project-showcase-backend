/**
 * Team alias = sanitized display name letters/digits (+ dashes); optional numeric suffix (`-2`, `-3`)
 * for global uniqueness against Team.alias. Stored on Team / Project; Docker image/name/DNS slug.
 */

import type { PrismaClient } from '@prisma/client';

type Db = Pick<PrismaClient, 'team'>;

/**
 * Keep only letters and numbers; lowercase; collapse whitespace to a single dash; trim dashes.
 */
export function sanitizeTeamNameForAliasSegment(name: string): string {
  const lower = name.toLowerCase().trim();
  const withDashes = lower.replace(/\s+/g, '-');
  const alnumSeparated = withDashes.replace(/[^a-z0-9-]/g, '');
  const collapsed = alnumSeparated.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return collapsed.length > 0 ? collapsed : 'team';
}

/** Base slug before uniqueness suffixes (`-2`, `-3`, …). */
export function baseTeamAliasFromName(teamName: string): string {
  return sanitizeTeamNameForAliasSegment(teamName);
}

async function allocateUniqueAliasForTeamColumn(
  db: Db,
  base: string,
  excludeTeamId?: number,
  blockedAliases?: ReadonlySet<string>,
): Promise<string> {
  let candidate = base;
  let n = 2;
  while (n < 10000) {
    if (blockedAliases?.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
      continue;
    }
    const existing = await db.team.findFirst({
      where: {
        alias: candidate,
        ...(excludeTeamId !== undefined ? { id: { not: excludeTeamId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    candidate = `${base}-${n}`;
    n += 1;
  }

  throw new Error('Could not allocate a unique team alias');
}

/**
 * Pick a globally unique Team.alias (`base`, `base-2`, …). SQLite UNIQUE allows multiple nulls for legacy rows.
 * Pass `blockedAliases` for dry-run batch simulation (already-claimed aliases in memory).
 */
export async function resolveUniqueTeamAlias(
  db: Db,
  teamName: string,
  excludeTeamId?: number,
  blockedAliases?: ReadonlySet<string>,
): Promise<string> {
  return allocateUniqueAliasForTeamColumn(
    db,
    baseTeamAliasFromName(teamName),
    excludeTeamId,
    blockedAliases,
  );
}

/**
 * Same uniqueness rules as {@link resolveUniqueTeamAlias}, but `rawSlugCandidate` comes from Docker / Project (e.g. backfill).
 */
export async function resolveUniqueAliasSlug(
  db: Db,
  rawSlugCandidate: string,
  excludeTeamId?: number,
  blockedAliases?: ReadonlySet<string>,
): Promise<string> {
  const base = sanitizeTeamNameForAliasSegment(rawSlugCandidate);
  return allocateUniqueAliasForTeamColumn(
    db,
    base,
    excludeTeamId,
    blockedAliases,
  );
}

/**
 * Best-effort slug from a team's currently running deployment row (persisted DNS alias preferred).
 */
export function deriveAliasSlugFromRunningProject(project: {
  alias: string | null;
  containerName: string | null;
}): string | null {
  if (project.alias?.trim()) {
    const s = sanitizeTeamNameForAliasSegment(project.alias);
    return s || null;
  }
  const name = project.containerName?.trim();
  if (!name) {
    return null;
  }
  const trimmed = name.startsWith('/') ? name.slice(1) : name;
  const s = sanitizeTeamNameForAliasSegment(trimmed);
  return s || null;
}

/**
 * Docker slug for image/container/DNS before Team.alias existed: lowercase name, spaces → dashes.
 */
export function legacyDockerSlugFromTeamName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Image/container/network alias: persisted Team.alias when set, otherwise legacy normalization. */
export function dockerDeploymentSlugForTeam(team: {
  alias: string | null;
  name: string;
}): string {
  return team.alias ?? legacyDockerSlugFromTeamName(team.name);
}
