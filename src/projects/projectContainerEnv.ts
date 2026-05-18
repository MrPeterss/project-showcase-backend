import { EnvironmentScope } from '@prisma/client';

import { prisma } from '../prisma.js';

/**
 * Build merged environment variables for container: TeamEnvironment PRODUCTION keys + extraEnvVars.
 */
export async function buildContainerEnv(
  teamId: number,
  extraEnvVars?: Record<string, string>,
): Promise<string[] | undefined> {
  const productionEnvs = await prisma.teamEnvironment.findMany({
    where: { teamId, scope: EnvironmentScope.PRODUCTION },
    select: { keyName: true, keyValue: true },
  });

  const merged: Record<string, string> = {};
  for (const env of productionEnvs) {
    merged[env.keyName] = env.keyValue;
  }
  if (extraEnvVars) {
    for (const [key, value] of Object.entries(extraEnvVars)) {
      merged[key] = value;
    }
  }

  const entries = Object.entries(merged);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${value}`)
    : undefined;
}

export async function resolveDockerBuildArgs(
  teamId: number,
  requestBuildArgs?: Record<string, string>,
  extraEnvVars?: Record<string, string>,
): Promise<Record<string, string>> {
  const productionEnvs = await prisma.teamEnvironment.findMany({
    where: { teamId, scope: EnvironmentScope.PRODUCTION },
    select: { keyName: true, keyValue: true },
  });

  const merged: Record<string, string> = {};
  for (const env of productionEnvs) {
    if (env.keyName.startsWith('VITE_')) {
      merged[env.keyName] = env.keyValue;
    }
  }
  if (extraEnvVars) {
    for (const [key, value] of Object.entries(extraEnvVars)) {
      if (key.startsWith('VITE_')) {
        merged[key] = value;
      }
    }
  }
  if (requestBuildArgs) {
    for (const [key, value] of Object.entries(requestBuildArgs)) {
      merged[key] = value;
    }
  }
  return merged;
}
