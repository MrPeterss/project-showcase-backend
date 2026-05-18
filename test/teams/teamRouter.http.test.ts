import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';
import { signTestJwt } from '../helpers/signTestJwt.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/middleware/logger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { EnvironmentScope } from '@prisma/client';

import { createApp } from '../../src/app.js';

const adminAuth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 1, isAdmin: true })}`,
});

describe('teamRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  it('returns team detail for admins', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue({
      id: 10,
      name: 'Alpha',
      alias: 'alpha',
      hallOfFame: false,
      createdAt: new Date(),
      courseOfferingId: 55,
      members: [],
      CourseOffering: { id: 55 },
      environments: [
        {
          id: 1,
          teamId: 10,
          keyName: 'K',
          keyValue: 'v',
          scope: EnvironmentScope.DEVELOPMENT,
          isSecret: false,
        },
      ],
    });

    vi.mocked(prismaMock.project.findFirst as Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    vi.mocked(prismaMock.projectOfferingTag.findMany as Mock).mockResolvedValue([]);

    const res = await request(createApp()).get('/teams/10').set(adminAuth()).expect(200);

    expect(res.body.name).toBe('Alpha');
    expect(res.body.projects).toEqual([]);
    expect(res.body.tags).toEqual([]);
  });

  it('404 when team does not exist', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue(null);

    await request(createApp()).get('/teams/999').set(adminAuth()).expect(404);
  });
});
