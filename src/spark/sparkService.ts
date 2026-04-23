import type { EnvironmentScope } from '@prisma/client';

import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';

export interface SparkKey {
  id: number;
  key: string;
  description: string;
  origin: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  limitTokensPerMinute: number | null;
  limitTokensPerHour: number | null;
}

export interface SparkStats {
  keyId: number;
  key?: string;
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
  hourly: { hour: string; count: number; totalTokens: number }[];
  daily: { date: string; count: number; totalTokens: number }[];
}

/** User breakdown from Spark (optional on per-key stats; merged for offering totals). */
export interface SparkTopUser {
  userId: number;
  netId?: string | null;
  name?: string | null;
  email?: string | null;
  requestCount: number;
  totalTokens: number;
}

/** Per-key usage within one hourly or daily bucket (for ranking teams/keys in that window). */
export interface SparkBucketKeyContribution {
  keyId: number;
  /** Spark key description (typically `"{teamName} ({scope})"`). */
  description: string;
  count: number;
  totalTokens: number;
}

export interface SparkAggregatedHourlyBlock {
  hour: string;
  count: number;
  totalTokens: number;
  /** Highest-usage keys in this hour (by `totalTokens`, then `count`). */
  topKeys: SparkBucketKeyContribution[];
}

export interface SparkAggregatedDailyBlock {
  date: string;
  count: number;
  totalTokens: number;
  /** Highest-usage keys on this day (by `totalTokens`, then `count`). */
  topKeys: SparkBucketKeyContribution[];
}

/** Combined stats for every Spark key in a course offering (same buckets as single-key stats). */
export interface SparkAggregatedKeysStats {
  keyIds: number[];
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
  hourly: SparkAggregatedHourlyBlock[];
  daily: SparkAggregatedDailyBlock[];
  topUsers: SparkTopUser[];
}

type SparkStatsResponse = SparkStats & { topUsers?: SparkTopUser[] };

const TOP_KEYS_PER_BUCKET = 10;

const buildHourlyBlocksWithTopKeys = (
  keys: SparkKey[],
  perKey: SparkStatsResponse[],
): SparkAggregatedHourlyBlock[] => {
  const byHour = new Map<string, Map<number, SparkBucketKeyContribution>>();
  for (let i = 0; i < keys.length; i++) {
    const sparkKey = keys[i];
    for (const row of perKey[i].hourly) {
      let m = byHour.get(row.hour);
      if (!m) {
        m = new Map();
        byHour.set(row.hour, m);
      }
      m.set(sparkKey.id, {
        keyId: sparkKey.id,
        description: sparkKey.description,
        count: row.count,
        totalTokens: row.totalTokens,
      });
    }
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, keyMap]) => {
      const contributions = [...keyMap.values()];
      const count = contributions.reduce((s, c) => s + c.count, 0);
      const totalTokens = contributions.reduce((s, c) => s + c.totalTokens, 0);
      const topKeys = [...contributions]
        .sort(
          (a, b) =>
            b.totalTokens - a.totalTokens ||
            b.count - a.count ||
            a.keyId - b.keyId,
        )
        .slice(0, TOP_KEYS_PER_BUCKET);
      return { hour, count, totalTokens, topKeys };
    });
};

const buildDailyBlocksWithTopKeys = (
  keys: SparkKey[],
  perKey: SparkStatsResponse[],
): SparkAggregatedDailyBlock[] => {
  const byDate = new Map<string, Map<number, SparkBucketKeyContribution>>();
  for (let i = 0; i < keys.length; i++) {
    const sparkKey = keys[i];
    for (const row of perKey[i].daily) {
      let m = byDate.get(row.date);
      if (!m) {
        m = new Map();
        byDate.set(row.date, m);
      }
      m.set(sparkKey.id, {
        keyId: sparkKey.id,
        description: sparkKey.description,
        count: row.count,
        totalTokens: row.totalTokens,
      });
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, keyMap]) => {
      const contributions = [...keyMap.values()];
      const count = contributions.reduce((s, c) => s + c.count, 0);
      const totalTokens = contributions.reduce((s, c) => s + c.totalTokens, 0);
      const topKeys = [...contributions]
        .sort(
          (a, b) =>
            b.totalTokens - a.totalTokens ||
            b.count - a.count ||
            a.keyId - b.keyId,
        )
        .slice(0, TOP_KEYS_PER_BUCKET);
      return { date, count, totalTokens, topKeys };
    });
};

const mergeTopUsers = (
  lists: (SparkTopUser[] | undefined)[],
  limit: number,
): SparkTopUser[] => {
  const byId = new Map<number, SparkTopUser>();
  for (const list of lists) {
    if (!list?.length) continue;
    for (const u of list) {
      const prev = byId.get(u.userId);
      if (!prev) {
        byId.set(u.userId, { ...u });
      } else {
        byId.set(u.userId, {
          userId: u.userId,
          requestCount: prev.requestCount + u.requestCount,
          totalTokens: prev.totalTokens + u.totalTokens,
          name: prev.name ?? u.name,
          email: prev.email ?? u.email,
          netId: prev.netId ?? u.netId,
        });
      }
    }
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        b.totalTokens - a.totalTokens ||
        b.requestCount - a.requestCount,
    )
    .slice(0, limit);
};

const maxIsoDate = (dates: (string | null)[]): string | null => {
  const valid = dates.filter((d): d is string => d != null && d !== '');
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a > b ? a : b));
};

type CourseOfferingWithDetails = {
  course: { department: string; number: number };
  semester: { season: string; year: number };
};

/**
 * Builds the canonical Spark origin string for a given course offering.
 * Format: "Project Server {department}{number} {season} {year}"
 * e.g. "Project Server CS4300 Fall 2025"
 */
export const buildCourseOfferingOrigin = (
  offering: CourseOfferingWithDetails,
): string => {
  const { course, semester } = offering;
  return `Project Server ${course.department}${course.number} ${semester.season} ${semester.year}`;
};

const getSparkBaseUrl = (): string => {
  const url = process.env.SPARK_BASE_URL;
  if (!url) throw new Error('SPARK_BASE_URL environment variable is not set');
  return url.replace(/\/$/, '');
};

const getSparkSecretKey = (): string => {
  const key = process.env.SPARK_SECRET_KEY;
  if (!key) throw new Error('SPARK_SECRET_KEY environment variable is not set');
  return key;
};

const callSparkApi = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const baseUrl = getSparkBaseUrl();
  const secretKey = getSparkSecretKey();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new BadRequestError(
      `Spark API error (${response.status}): ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
};

const getCourseOfferingWithDetails = async (offeringId: number) => {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: true, semester: true },
  });
  if (!offering) throw new NotFoundError('Course offering not found');
  return offering;
};

/**
 * Issues a Spark API key for each selected team (or all teams if no teamIds given),
 * stores each key as a TeamEnvironment entry, and returns the results.
 */
export const issueSparkKeys = async (
  offeringId: number,
  teamIds: number[] | undefined,
  isSecret: boolean,
  scope: EnvironmentScope,
  limitTokensPerMinute?: number | null,
  limitTokensPerHour?: number | null,
) => {
  const offering = await getCourseOfferingWithDetails(offeringId);
  const origin = buildCourseOfferingOrigin(offering);

  const teams = await prisma.team.findMany({
    where: {
      courseOfferingId: offeringId,
      ...(teamIds && teamIds.length > 0 ? { id: { in: teamIds } } : {}),
    },
  });

  if (teams.length === 0) {
    throw new NotFoundError('No teams found for this course offering');
  }

  const existingEnvs = await prisma.teamEnvironment.findMany({
    where: {
      teamId: { in: teams.map((t) => t.id) },
      keyName: 'SPARK_API_KEY',
      scope,
    },
    select: { teamId: true },
  });
  const teamsWithExistingKey = new Set(existingEnvs.map((e) => e.teamId));

  const results = await Promise.all(
    teams.map(async (team) => {
      if (teamsWithExistingKey.has(team.id)) {
        return { team: { id: team.id, name: team.name }, skipped: true };
      }

      const sparkResponse = await callSparkApi<{ keys: SparkKey[] }>(
        '/api/keys/issue',
        {
          method: 'POST',
          body: JSON.stringify({
            descriptions: [`${team.name} (${scope})`],
            origin,
            ...(limitTokensPerMinute !== undefined && { limitTokensPerMinute }),
            ...(limitTokensPerHour !== undefined && { limitTokensPerHour }),
          }),
        },
      );

      const sparkKey = sparkResponse.keys[0];

      await prisma.teamEnvironment.create({
        data: {
          teamId: team.id,
          keyName: 'SPARK_API_KEY',
          keyValue: sparkKey.key,
          scope,
          isSecret,
        },
      });

      return { team: { id: team.id, name: team.name }, skipped: false, sparkKey };
    }),
  );

  return results;
};

/**
 * Returns all Spark keys whose origin matches this course offering.
 */
export const getSparkKeysForOffering = async (
  offeringId: number,
): Promise<SparkKey[]> => {
  const offering = await getCourseOfferingWithDetails(offeringId);
  const origin = buildCourseOfferingOrigin(offering);

  const response = await callSparkApi<{ keys: SparkKey[] } | SparkKey[]>(
    `/api/keys?origin=${encodeURIComponent(origin)}`,
  );

  return Array.isArray(response) ? response : response.keys;
};

/**
 * Revokes a Spark key, verifying it belongs to this course offering first.
 */
export const revokeSparkKey = async (
  offeringId: number,
  sparkKeyId: number,
): Promise<void> => {
  const keys = await getSparkKeysForOffering(offeringId);

  const key = keys.find((k) => k.id === sparkKeyId);
  if (!key) {
    throw new NotFoundError('Spark key not found for this course offering');
  }

  await callSparkApi('/api/keys/revoke', {
    method: 'POST',
    body: JSON.stringify({ keyIds: [sparkKeyId] }),
  });

  await prisma.teamEnvironment.deleteMany({
    where: { keyName: 'SPARK_API_KEY', keyValue: key.key },
  });
};

/**
 * Returns usage stats for a Spark key, verifying it belongs to this course offering first.
 */
export const getSparkKeyStats = async (
  offeringId: number,
  sparkKeyId: number,
): Promise<SparkStats> => {
  const keys = await getSparkKeysForOffering(offeringId);

  const key = keys.find((k) => k.id === sparkKeyId);
  if (!key) {
    throw new NotFoundError('Spark key not found for this course offering');
  }

  return callSparkApi<SparkStats>(
    `/api/stats?key=${encodeURIComponent(key.key)}`,
  );
};

/**
 * Aggregate usage for every Spark key in this offering: same hourly/daily series as
 * single-key stats, summed across keys. `topUsers` merges per-key `topUsers` from Spark
 * (last 48h breakdown) and returns the top 10 by total tokens.
 */
export const getSparkAggregatedKeyStats = async (
  offeringId: number,
): Promise<SparkAggregatedKeysStats> => {
  const keys = await getSparkKeysForOffering(offeringId);

  if (keys.length === 0) {
    return {
      keyIds: [],
      totalRequests: 0,
      totalTokens: 0,
      lastUsedAt: null,
      hourly: [],
      daily: [],
      topUsers: [],
    };
  }

  const { stats } = await callSparkApi<{ stats: SparkStatsResponse[] }>(
    '/api/stats/batch',
    {
      method: 'POST',
      body: JSON.stringify({ keys: keys.map((k) => k.key) }),
    },
  );

  // Batch results may arrive in any order; re-align with the keys array by key string.
  const statsByKey = new Map(stats.map((s) => [s.key, s]));
  const perKey = keys.map(
    (k): SparkStatsResponse =>
      statsByKey.get(k.key) ?? {
        keyId: k.id,
        key: k.key,
        totalRequests: 0,
        totalTokens: 0,
        lastUsedAt: null,
        hourly: [],
        daily: [],
      },
  );

  return {
    keyIds: keys.map((k) => k.id),
    totalRequests: perKey.reduce((s, x) => s + x.totalRequests, 0),
    totalTokens: perKey.reduce((s, x) => s + x.totalTokens, 0),
    lastUsedAt: maxIsoDate(perKey.map((x) => x.lastUsedAt)),
    hourly: buildHourlyBlocksWithTopKeys(keys, perKey),
    daily: buildDailyBlocksWithTopKeys(keys, perKey),
    topUsers: mergeTopUsers(
      perKey.map((x) => x.topUsers),
      10,
    ),
  };
};
