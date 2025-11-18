import { z } from 'zod';

export const deployProjectSchema = z.object({
  body: z.object({
    teamId: z.string().transform(Number).pipe(z.number().int().positive()),
    githubUrl: z
      .string()
      .url()
      .regex(
        /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+(\/(tree|blob)\/[\w.-]+)?(\.git)?$/,
        'Must be a valid GitHub repository URL',
      ),
    buildArgs: z.string().optional().transform((val) => {
      if (!val) return undefined;
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }),
  }),
});

export const getTeamProjectsSchema = z.object({
  params: z.object({
    teamId: z.string().transform(Number).pipe(z.number().int().positive()),
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
