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

