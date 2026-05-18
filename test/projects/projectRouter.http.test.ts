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

const auth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 3, isAdmin: false })}`,
});

describe('projectRouter HTTP (read paths)', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  it('lists projects via prisma aggregation', async () => {
    vi.mocked(prismaMock.project.findMany as Mock).mockResolvedValue([]);

    const res = await request(createApp()).get('/projects').set(auth()).expect(200);

    expect(res.body.projects).toEqual([]);
  });

  it('gets one project by id', async () => {
    vi.mocked(prismaMock.project.findUnique as Mock).mockResolvedValue({
      id: 7,
      teamId: 2,
      githubUrl: 'https://github.com/a/b.git',
      courseOfferingId: null,
      alias: null,
      imageHash: 'sha256:x',
      containerId: null,
      containerName: null,
      status: 'stopped',
      ports: null,
      deployedAt: new Date(),
      stoppedAt: null,
      deployedByUserId: 3,
      team: { id: 2, name: 't', hallOfFame: false },
      deployedBy: { id: 3, name: 'u', email: 'u@test.edu' },
    });

    await request(createApp()).get('/projects/7').set(auth()).expect(200);
  });

  it('lists projects for a team', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue({ id: 8 });
    vi.mocked(prismaMock.project.findMany as Mock).mockResolvedValue([]);

    await request(createApp()).get('/projects/team/8').set(auth()).expect(200);
  });

  it('404 when team missing for team projects route', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue(null);

    await request(createApp()).get('/projects/team/404').set(auth()).expect(404);
  });
});
