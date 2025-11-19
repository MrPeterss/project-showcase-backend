import { z } from 'zod';

export const buildOldProjectSchema = z.object({
  body: z.object({
    teamId: z.string().transform((val, ctx) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid team ID',
        });
        return z.NEVER;
      }
      return parsed;
    }),
    githubUrl: z
      .string()
      .url()
      .regex(
        /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+(\/(tree|blob)\/[\w.-]+)?(\.git)?$/,
        'Must be a valid GitHub repository URL',
      ),
  }),
});

