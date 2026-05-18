import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/config/env.js';
import { requireAuth } from '../../src/middleware/authentication.js';
import { globalErrorHandler } from '../../src/middleware/errorHandler.js';

function buildAuthProbeApp() {
  loadEnv();
  const app = express();
  app.get('/probe', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(globalErrorHandler);
  return app;
}

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = buildAuthProbeApp();
    const res = await request(app).get('/probe').expect(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is invalid', async () => {
    const app = buildAuthProbeApp();
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('allows requests with a valid Bearer token', async () => {
    const app = buildAuthProbeApp();
    const secret = loadEnv().ACCESS_TOKEN_SECRET;
    const token = jwt.sign({ userId: 42, isAdmin: false }, secret, {
      expiresIn: '5m',
    });
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ ok: true });
  });
});
