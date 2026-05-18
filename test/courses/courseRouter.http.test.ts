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

const authHeader = (isAdmin = true) => ({
  Authorization: `Bearer ${signTestJwt({ userId: 1, isAdmin })}`,
});

describe('courseRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  it('lists courses for admins', async () => {
    const rows = [{ id: 1, name: 'CS', number: 2110, department: 'ENG', createdAt: new Date() }];
    vi.mocked(prismaMock.course.findMany as Mock).mockResolvedValue(rows);

    const res = await request(createApp()).get('/courses').set(authHeader(true)).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 1,
      name: 'CS',
      number: 2110,
      department: 'ENG',
    });
  });

  it('returns a single course', async () => {
    const row = {
      id: 2,
      name: 'Algorithms',
      number: 4820,
      department: 'CS',
      createdAt: new Date(),
      offerings: [],
    };
    vi.mocked(prismaMock.course.findUnique as Mock).mockResolvedValue(row);

    await request(createApp()).get('/courses/2').set(authHeader(true)).expect(200);
  });

  it('creates a course', async () => {
    const created = {
      id: 9,
      name: 'New',
      number: 5000,
      department: 'INFO',
      createdAt: new Date(),
    };
    vi.mocked(prismaMock.course.create as Mock).mockResolvedValue(created);

    const res = await request(createApp())
      .post('/courses')
      .set(authHeader(true))
      .send({ name: 'New', number: 5000, department: 'INFO' })
      .expect(201);

    expect(res.body.id).toBe(9);
  });

  it('updates an existing course', async () => {
    vi.mocked(prismaMock.course.findUnique as Mock).mockResolvedValue({ id: 3 });
    vi.mocked(prismaMock.course.update as Mock).mockResolvedValue({
      id: 3,
      name: 'Updated',
      number: 4820,
      department: 'CS',
      createdAt: new Date(),
    });

    await request(createApp())
      .put('/courses/3')
      .set(authHeader(true))
      .send({
        name: 'Updated',
        number: 4820,
        department: 'CS',
      })
      .expect(200);
  });

  it('deletes a course', async () => {
    vi.mocked(prismaMock.course.findUnique as Mock).mockResolvedValue({ id: 4 });
    vi.mocked(prismaMock.course.delete as Mock).mockResolvedValue({});

    await request(createApp()).delete('/courses/4').set(authHeader(true)).expect(204);
  });

  it('rejects non-admin course routes', async () => {
    await request(createApp()).get('/courses').set(authHeader(false)).expect(403);
  });
});
