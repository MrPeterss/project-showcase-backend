import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../src/middleware/logger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { prisma } from '../src/prisma.js';
import { createApp } from '../src/app.js';

describe('createApp', () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(1 as never);
  });

  it('constructs an Express app', () => {
    const app = createApp();
    expect(typeof app.use).toBe('function');
    expect(typeof app.get).toBe('function');
  });

  it('reports healthy database on /health when prisma succeeds', async () => {
    const app = createApp();
    const res = await request(app).get('/health').expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.database).toBe('connected');
  });

  it('reports unhealthy database when prisma fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('db down'));

    const app = createApp();
    const res = await request(app).get('/health').expect(503);

    expect(res.body.status).toBe('unhealthy');
    expect(res.body.database).toBe('disconnected');
  });
});
