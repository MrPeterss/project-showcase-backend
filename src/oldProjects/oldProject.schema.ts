import { z } from 'zod';

export const buildOldProjectSchema = z.object({
  body: z.object({
    teamId: z.number().int(),
    githubUrl: z
      .string()
      .url()
      .regex(
        /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+(\/(tree|blob)\/[\w.-]+)?(\.git)?$/,
        'Must be a valid GitHub repository URL',
      ),
  }),
});

