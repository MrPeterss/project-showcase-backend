import type { Request, Response } from 'express';

import type { EnvironmentScope } from '@prisma/client';

import { ForbiddenError } from '../utils/AppError.js';
import { checkInstructorAccess } from '../utils/authorizationHelpers.js';
import {
  getSparkAggregatedKeyStats,
  getSparkKeyStats,
  getSparkKeysForOffering,
  issueSparkKeys,
  revokeSparkKey,
} from './sparkService.js';

const requireInstructorOrAdmin = async (
  userId: number,
  isAdmin: boolean,
  offeringId: number,
) => {
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(userId, offeringId);
    if (!instructorAccess) {
      throw new ForbiddenError(
        'Only instructors or admins can manage Spark keys',
      );
    }
  }
};

// POST /course-offerings/:offeringId/spark/keys
export const issueKeys = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const { teamIds, isSecret, scope, limitTokensPerMinute, limitTokensPerHour } =
    req.body as {
      teamIds?: number[];
      isSecret: boolean;
      scope: EnvironmentScope;
      limitTokensPerMinute?: number | null;
      limitTokensPerHour?: number | null;
    };

  await requireInstructorOrAdmin(userId, isAdmin, offeringId);

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
  const offeringId = parseInt(req.params.offeringId, 10);

  await requireInstructorOrAdmin(userId, isAdmin, offeringId);

  const keys = await getSparkKeysForOffering(offeringId);

  return res.json(keys);
};

// DELETE /course-offerings/:offeringId/spark/keys/:sparkKeyId
export const revokeKey = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const sparkKeyId = parseInt(req.params.sparkKeyId, 10);

  await requireInstructorOrAdmin(userId, isAdmin, offeringId);

  await revokeSparkKey(offeringId, sparkKeyId);

  return res.status(204).send();
};

// GET /course-offerings/:offeringId/spark/keys/stats
export const getKeysStats = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  await requireInstructorOrAdmin(userId, isAdmin, offeringId);

  const stats = await getSparkAggregatedKeyStats(offeringId);

  return res.json(stats);
};

// GET /course-offerings/:offeringId/spark/keys/:sparkKeyId/stats
export const getKeyStats = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const sparkKeyId = parseInt(req.params.sparkKeyId, 10);

  await requireInstructorOrAdmin(userId, isAdmin, offeringId);

  const stats = await getSparkKeyStats(offeringId, sparkKeyId);

  return res.json(stats);
};
