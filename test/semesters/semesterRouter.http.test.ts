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

const adminAuth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 2, isAdmin: true })}`,
});

const anyUserAuth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 50, isAdmin: false })}`,
});

describe('semesterRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  it('lists semesters for any authenticated user (not admin-only)', async () => {
    vi.mocked(prismaMock.semester.findMany as Mock).mockResolvedValue([]);

    await request(createApp()).get('/semesters').set(anyUserAuth()).expect(200);
  });

  it('gets one semester for admins', async () => {
    vi.mocked(prismaMock.semester.findUnique as Mock).mockResolvedValue({
      id: 1,
      season: 'Fall',
      year: 2026,
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
    });

    await request(createApp()).get('/semesters/1').set(adminAuth()).expect(200);
  });

  it('creates a semester', async () => {
    const row = {
      id: 10,
      season: 'Spring',
      year: 2027,
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
    };
    vi.mocked(prismaMock.semester.create as Mock).mockResolvedValue(row);

    const res = await request(createApp())
      .post('/semesters')
      .set(adminAuth())
      .send({
        season: 'Spring',
        year: 2027,
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-05-01T00:00:00.000Z',
      })
      .expect(201);

    expect(res.body.id).toBe(10);
  });

  it('updates a semester', async () => {
    vi.mocked(prismaMock.semester.findUnique as Mock).mockResolvedValue({ id: 5 });
    vi.mocked(prismaMock.semester.update as Mock).mockResolvedValue({
      id: 5,
      season: 'Fall',
      year: 2028,
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
    });

    await request(createApp())
      .put('/semesters/5')
      .set(adminAuth())
      .send({
        season: 'Fall',
        year: 2028,
        startDate: '2028-08-01T00:00:00.000Z',
        endDate: '2028-12-01T00:00:00.000Z',
      })
      .expect(200);
  });

  it('deletes a semester', async () => {
    vi.mocked(prismaMock.semester.findUnique as Mock).mockResolvedValue({ id: 6 });
    vi.mocked(prismaMock.semester.delete as Mock).mockResolvedValue({});

    await request(createApp()).delete('/semesters/6').set(adminAuth()).expect(204);
  });
});
