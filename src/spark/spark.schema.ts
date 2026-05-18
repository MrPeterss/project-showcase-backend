import { z } from 'zod';

import {
  offeringIdParam,
  sparkKeyIdParam,
} from '../schemas/paramCoercions.js';

export const sparkOfferingParamsSchema = z.object({
  params: z.object({
    offeringId: offeringIdParam,
  }),
});

export const sparkKeyParamsSchema = z.object({
  params: z.object({
    offeringId: offeringIdParam,
    sparkKeyId: sparkKeyIdParam,
  }),
});

export const issueSparkKeysSchema = z.object({
  params: z.object({
    offeringId: offeringIdParam,
  }),
  body: z.object({
    teamIds: z.array(z.number().int().positive()).optional(),
    isSecret: z.boolean(),
    scope: z.enum(['PRODUCTION', 'DEVELOPMENT']),
    limitTokensPerMinute: z.number().int().positive().nullable().optional(),
    limitTokensPerHour: z.number().int().positive().nullable().optional(),
  }),
});
