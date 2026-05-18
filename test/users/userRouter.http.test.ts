import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';
import { signTestJwt } from '../helpers/signTestJwt.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/middleware/logger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createApp } from '../../src/app.js';

describe('userRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  it('returns the authenticated user profile', async () => {
    const userRow = {
      id: 42,
      email: 'user@test.edu',
      name: 'Tester',
      isAdmin: false,
      createdAt: new Date(),
    };
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue(userRow);

    const res = await request(createApp())
      .get('/users/me')
      .set({
        Authorization: `Bearer ${signTestJwt({ userId: 42, isAdmin: false })}`,
      })
      .expect(200);

    expect(res.body.email).toBe('user@test.edu');
  });

  it('404 when user row missing', async () => {
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue(null);

    await request(createApp())
      .get('/users/me')
      .set({
        Authorization: `Bearer ${signTestJwt({ userId: 99, isAdmin: false })}`,
      })
      .expect(404);
  });
});
