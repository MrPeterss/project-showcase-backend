import { z } from 'zod';

/** Stored as string on Project.status until a dedicated Prisma enum migration ships. */
export const PROJECT_STATUS = {
  BUILDING: 'building',
  DEPLOYING: 'deploying',
  RUNNING: 'running',
  STOPPED: 'stopped',
  FAILED: 'failed',
  PRUNED: 'pruned',
} as const;

export type ProjectStatusValue =
  (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_VALUES = [
  PROJECT_STATUS.BUILDING,
  PROJECT_STATUS.DEPLOYING,
  PROJECT_STATUS.RUNNING,
  PROJECT_STATUS.STOPPED,
  PROJECT_STATUS.FAILED,
  PROJECT_STATUS.PRUNED,
] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUS_VALUES);
