import type { ZodRawShape, ZodObject } from 'zod';
import { ZodError } from 'zod';

import type { NextFunction, Request, Response } from 'express';

import type { ValidatedRequestParts } from '../types/express/index.js';
import { ValidationError } from '../utils/AppError.js';

export const validateRequest =
  (schema: ZodObject<ZodRawShape>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as Record<string, unknown>;

      const prev = req.validated ?? {};
      const validated: ValidatedRequestParts = { ...prev };

      if ('body' in parsed && parsed.body !== undefined) {
        req.body = parsed.body;
        validated.body = parsed.body;
      }
      if ('params' in parsed && parsed.params !== undefined) {
        validated.params = {
          ...(prev.params ?? {}),
          ...(parsed.params as Record<string, unknown>),
        };
      }
      if ('query' in parsed && parsed.query !== undefined) {
        validated.query = {
          ...(prev.query ?? {}),
          ...(parsed.query as Record<string, unknown>),
        };
      }

      req.validated = validated;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const formattedErrors = err.issues.reduce(
          (acc, issue) => {
            const path = issue.path.join('.');
            acc[path] = issue.message;
            return acc;
          },
          {} as Record<string, string>,
        );

        const validationError = new ValidationError(
          'Request validation failed',
          formattedErrors,
        );
        return next(validationError);
      }
      next(err);
    }
  };
