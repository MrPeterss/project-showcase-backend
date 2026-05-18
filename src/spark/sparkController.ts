import type { Request, Response } from 'express';

import type { EnvironmentScope } from '@prisma/client';

import { assertInstructorOrAdmin } from '../utils/authorizationHelpers.js';
import {
  getSparkAggregatedKeyStats,
  getSparkKeyStats,
  getSparkKeysForOffering,
  issueSparkKeys,
  revokeSparkKey,
} from './sparkService.js';

const sparkKeysForbidden =
  'Only instructors or admins can manage Spark keys';

// POST /course-offerings/:offeringId/spark/keys
export const issueKeys = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = req.validated!.params!.offeringId as number;
  const { teamIds, isSecret, scope, limitTokensPerMinute, limitTokensPerHour } =
    req.body as {
      teamIds?: number[];
      isSecret: boolean;
      scope: EnvironmentScope;
      limitTokensPerMinute?: number | null;
      limitTokensPerHour?: number | null;
    };

  await assertInstructorOrAdmin(
    userId,
    isAdmin,
    offeringId,
    sparkKeysForbidden,
  );

  const results = await issueSparkKeys(
    offeringId,
    teamIds,
    isSecret,
    scope,
    limitTokensPerMinute,
    limitTokensPerHour,
  );

  return res.status(201).json(results);
};

// GET /course-offerings/:offeringId/spark/keys
export const getKeys = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = req.validated!.params!.offeringId as number;

  await assertInstructorOrAdmin(
    userId,
    isAdmin,
    offeringId,
    sparkKeysForbidden,
  );

  const keys = await getSparkKeysForOffering(offeringId);

  return res.json(keys);
};

// DELETE /course-offerings/:offeringId/spark/keys/:sparkKeyId
export const revokeKey = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = req.validated!.params!.offeringId as number;
  const sparkKeyId = req.validated!.params!.sparkKeyId as number;

  await assertInstructorOrAdmin(
    userId,
    isAdmin,
    offeringId,
    sparkKeysForbidden,
  );

  await revokeSparkKey(offeringId, sparkKeyId);

  return res.status(204).send();
};

// GET /course-offerings/:offeringId/spark/keys/stats
export const getKeysStats = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = req.validated!.params!.offeringId as number;

  await assertInstructorOrAdmin(
    userId,
    isAdmin,
    offeringId,
    sparkKeysForbidden,
  );

  const stats = await getSparkAggregatedKeyStats(offeringId);

  return res.json(stats);
};

// GET /course-offerings/:offeringId/spark/keys/:sparkKeyId/stats
export const getKeyStats = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = req.validated!.params!.offeringId as number;
  const sparkKeyId = req.validated!.params!.sparkKeyId as number;

  await assertInstructorOrAdmin(
    userId,
    isAdmin,
    offeringId,
    sparkKeysForbidden,
  );

  const stats = await getSparkKeyStats(offeringId, sparkKeyId);

  return res.json(stats);
};
