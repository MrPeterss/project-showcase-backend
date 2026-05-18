import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { globalErrorHandler } from '../../src/middleware/errorHandler.js';
import { validateRequest } from '../../src/middleware/validateRequest.js';

const schema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

describe('validateRequest', () => {
  it('parses route params onto req.validated and calls next', async () => {
    const app = express();
    app.get('/:id', validateRequest(schema), (req, res) => {
      res.json({ validated: req.validated });
    });
    app.use(globalErrorHandler);

    const res = await request(app).get('/42').expect(200);
    expect(res.body.validated.params.id).toBe(42);
  });

  it('chains validated.params across stacked validators', async () => {
    const schemaB = z.object({
      params: z.object({
        other: z.coerce.number().int().positive(),
      }),
    });

    const app = express();
    app.get(
      '/:id/:other',
      validateRequest(schema),
      validateRequest(schemaB),
      (req, res) => {
        res.json({ validated: req.validated });
      },
    );
    app.use(globalErrorHandler);

    const res = await request(app).get('/7/99').expect(200);
    expect(res.body.validated.params).toMatchObject({ id: 7, other: 99 });
  });

  it('passes ValidationError to error handler when parse fails', async () => {
    const app = express();
    app.get('/:id', validateRequest(schema), (_req, res) => res.sendStatus(200));
    app.use(globalErrorHandler);

    const res = await request(app).get('/not-a-number').expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});
