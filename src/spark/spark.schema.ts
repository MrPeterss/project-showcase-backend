import { z } from 'zod';

const offeringIdParam = z.string().transform((val, ctx) => {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid offering ID' });
    return z.NEVER;
  }
  return parsed;
});

const sparkKeyIdParam = z.string().transform((val, ctx) => {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Spark key ID' });
    return z.NEVER;
  }
  return parsed;
});

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
