import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

vi.mock('../../src/docker.js', () => ({
  docker: {
    listContainers: vi.fn(),
    getNetwork: vi.fn(),
    createNetwork: vi.fn(),
    getContainer: vi.fn(),
    getImage: vi.fn(),
  },
}));

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import { migrateProjectContainer } from '../../src/admin/migrationService.js';

describe('migrationService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  it('migrateProjectContainer throws when team is missing', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue(null);

    await expect(
      migrateProjectContainer('some-container', 999),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
