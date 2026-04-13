import { z } from 'zod';

export const deployProjectSchema = z.object({
  body: z.object({
    teamId: z.string().transform((val, ctx) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid offering ID',
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
    // Multipart sends JSON as a string; `application/json` bodies use a nested object.
    buildArgs: z
      .union([z.string(), z.record(z.string(), z.string())])
      .optional()
      .transform((val, ctx) => {
        if (val === undefined || val === '') return undefined;
        if (typeof val === 'object' && val !== null) {
          return val as Record<string, string>;
        }
        try {
          const parsed = JSON.parse(val) as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'buildArgs must be a JSON object',
            });
            return z.NEVER;
          }
          const out: Record<string, string> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== 'string') {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `buildArgs.${key} must be a string`,
              });
              return z.NEVER;
            }
            out[key] = value;
          }
          return out;
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'buildArgs must be valid JSON',
          });
          return z.NEVER;
        }
      }),
    extraEnvVars: z.string().optional().transform((val, ctx) => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        
        // Validate it's an object
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'extraEnvVars must be a JSON object',
          });
          return z.NEVER;
        }
        
        return parsed;
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'extraEnvVars must be valid JSON',
        });
        return z.NEVER;
      }
    }),
  }),
});

export const getTeamProjectsSchema = z.object({
  params: z.object({
    teamId: z.string().transform((val, ctx) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid offering ID',
        });
        return z.NEVER;
      }
      return parsed;
    }),
  }),
});

export const stopProjectSchema = z.object({
  params: z.object({
    projectId: z.string().transform(Number).pipe(z.number().int().positive()),
  }),
});

export const streamProjectLogsSchema = z.object({
  params: z.object({
    projectId: z.string().transform(Number).pipe(z.number().int().positive()),
  }),
  query: z.object({
    tail: z
      .string()
      .optional()
      .transform((val) => (val ? Number(val) : 100))
      .pipe(z.number().int().positive().max(10000)),
    since: z.string().optional(),
    timestamps: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  }),
});

export const streamBuildLogsSchema = z.object({
  params: z.object({
    projectId: z.string().transform(Number).pipe(z.number().int().positive()),
  }),
});

export const redeployProjectSchema = z.object({
  params: z.object({
    projectId: z.string().transform(Number).pipe(z.number().int().positive()),
  }),
});
