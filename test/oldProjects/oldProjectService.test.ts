import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

vi.mock('../../src/docker.js', () => ({
  docker: {
    getContainer: vi.fn(() => ({
      stop: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('../../src/git.js', () => ({
  git: {
    clone: vi.fn(),
  },
}));

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import { buildOldJson } from '../../src/oldProjects/oldProjectService.js';

describe('oldProjectService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  it('buildOldJson throws when team does not exist', async () => {
    vi.mocked(prismaMock.team.findUnique as Mock).mockResolvedValue(null);

    await expect(
      buildOldJson(1, 'https://github.com/org/repo.git', 2),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
