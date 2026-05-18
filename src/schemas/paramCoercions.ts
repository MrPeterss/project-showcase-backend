import { z } from 'zod';

/**
 * Express route params arrive as strings; coerce to positive integers with clear validation errors.
 */
export function positiveIntParam(fieldLabel = 'ID') {
  return z.string().transform((val, ctx) => {
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid ${fieldLabel}`,
      });
      return z.NEVER;
    }
    return parsed;
  });
}

export const offeringIdParam = positiveIntParam('offering ID');
export const courseIdParam = positiveIntParam('course ID');
export const teamIdParam = positiveIntParam('team ID');
export const semesterIdParam = positiveIntParam('semester ID');
export const projectIdParam = positiveIntParam('project ID');
export const sparkKeyIdParam = positiveIntParam('Spark key ID');
export const userIdParam = positiveIntParam('user ID');
