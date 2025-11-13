import { z } from 'zod';

export const deployProjectSchema = z.object({
  body: z.object({
    githubUrl: z
      .string()
      .url()
      .regex(
        /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+(\/(tree|blob)\/[\w.-]+)?(\.git)?$/,
        'Must be a valid GitHub repository URL',
      ),
  }),
});
