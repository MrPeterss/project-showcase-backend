import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
  },
}));

import { PROJECT_STATUS } from '../../src/constants/projectStatus.js';
import { prisma } from '../../src/prisma.js';
import { getTeamPreferredProject } from '../../src/utils/projectUtils.js';

describe('getTeamPreferredProject', () => {
  beforeEach(() => {
    vi.mocked(prisma.project.findFirst).mockReset();
  });

  it('returns newest running project when one exists', async () => {
    const running = { id: 2, status: PROJECT_STATUS.RUNNING };
    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce(running as never);

    await expect(getTeamPreferredProject(7)).resolves.toEqual(running);

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId: 7,
          status: PROJECT_STATUS.RUNNING,
        }),
      }),
    );
  });

  it('falls back to newest project regardless of status when none running', async () => {
    vi.mocked(prisma.project.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: 3 } as never);

    await expect(getTeamPreferredProject(7)).resolves.toEqual({ id: 3 });

    expect(prisma.project.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.project.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { teamId: 7 },
      }),
    );
  });
});
