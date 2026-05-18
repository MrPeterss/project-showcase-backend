import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';
import { signTestJwt } from '../helpers/signTestJwt.js';

const sparkSvc = vi.hoisted(() => ({
  issueSparkKeys: vi.fn().mockResolvedValue({ issued: [] }),
  getSparkKeysForOffering: vi.fn().mockResolvedValue([]),
  revokeSparkKey: vi.fn().mockResolvedValue(undefined),
  getSparkAggregatedKeyStats: vi.fn().mockResolvedValue({ totals: {} }),
  getSparkKeyStats: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/spark/sparkService.js', () => sparkSvc);

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/middleware/logger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createApp } from '../../src/app.js';

const adminAuth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 1, isAdmin: true })}`,
});

describe('sparkRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
    sparkSvc.issueSparkKeys.mockClear();
    sparkSvc.getSparkKeysForOffering.mockClear();
    sparkSvc.revokeSparkKey.mockClear();
    sparkSvc.getSparkAggregatedKeyStats.mockClear();
    sparkSvc.getSparkKeyStats.mockClear();
  });

  it('issues Spark keys', async () => {
    await request(createApp())
      .post('/course-offerings/3/spark/keys')
      .set(adminAuth())
      .send({
        isSecret: false,
        scope: 'DEVELOPMENT',
      })
      .expect(201);

    expect(sparkSvc.issueSparkKeys).toHaveBeenCalled();
  });

  it('lists Spark keys', async () => {
    await request(createApp())
      .get('/course-offerings/3/spark/keys')
      .set(adminAuth())
      .expect(200);

    expect(sparkSvc.getSparkKeysForOffering).toHaveBeenCalledWith(3);
  });

  it('revokes a Spark key', async () => {
    await request(createApp())
      .delete('/course-offerings/3/spark/keys/12')
      .set(adminAuth())
      .expect(204);

    expect(sparkSvc.revokeSparkKey).toHaveBeenCalledWith(3, 12);
  });

  it('returns aggregated stats', async () => {
    await request(createApp())
      .get('/course-offerings/3/spark/keys/stats')
      .set(adminAuth())
      .expect(200);

    expect(sparkSvc.getSparkAggregatedKeyStats).toHaveBeenCalledWith(3);
  });

  it('returns single-key stats', async () => {
    await request(createApp())
      .get('/course-offerings/3/spark/keys/12/stats')
      .set(adminAuth())
      .expect(200);

    expect(sparkSvc.getSparkKeyStats).toHaveBeenCalledWith(3, 12);
  });
});
