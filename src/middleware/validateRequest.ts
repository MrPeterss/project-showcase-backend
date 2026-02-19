import type { ZodObject } from 'zod';
import { ZodError } from 'zod';

import type { NextFunction, Request, Response } from 'express';

import { ValidationError } from '../utils/AppError.js';

export const validateRequest =
  (schema: ZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      // Update req with validated/transformed values if they exist
      if (validated.body !== undefined) {
        req.body = validated.body;
      }
      if (validated.params !== undefined) {
        req.params = validated.params as any;
      }
      if (validated.query !== undefined) {
        req.query = validated.query as any;
      }
      
      // If validation is successful, continue
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Format ZodError issues into a clean object
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
