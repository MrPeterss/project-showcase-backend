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
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
  hourly: { hour: string; count: number; totalTokens: number }[];
  daily: { date: string; count: number; totalTokens: number }[];
}

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
