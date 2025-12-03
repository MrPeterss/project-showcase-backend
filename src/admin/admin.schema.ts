import { z } from 'zod';

export const containerIdParamsSchema = z.object({
  params: z.object({
    containerId: z.string().min(1, 'Container ID is required'),
  }),
});

export const imageIdParamsSchema = z.object({
  params: z.object({
    imageId: z.string().min(1, 'Image ID or name is required'),
  }),
});

export const fileNameParamsSchema = z.object({
  params: z.object({
    fileName: z.string().min(1, 'File name is required'),
  }),
});

export const projectIdParamsSchema = z.object({
  params: z.object({
    projectId: z.string().regex(/^\d+$/, 'Project ID must be a number'),
  }),
});

export const userIdParamsSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^\d+$/, 'User ID must be a number'),
  }),
});

export const updateUserNameSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name cannot be empty').nullable().optional(),
  }),
});

export const migrateProjectSchema = z.object({
  body: z.object({
    projectName: z.string().min(1, 'Project name (container name) is required'),
    teamId: z.number().int().positive(),
    githubUrl: z.string().url().optional(),
  }),
});

