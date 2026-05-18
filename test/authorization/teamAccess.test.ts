import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    team: {
      findUnique: vi.fn(),
    },
    courseOfferingEnrollment: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/prisma.js';
import {
  assertTeamBelongsToOffering,
  assertTeamReadableByUser,
} from '../../src/authorization/teamAccess.js';

describe('teamAccess', () => {
  beforeEach(() => {
    vi.mocked(prisma.team.findUnique).mockReset();
    vi.mocked(prisma.courseOfferingEnrollment.findMany).mockReset();
  });

  describe('assertTeamBelongsToOffering', () => {
    it('throws when team missing', async () => {
      vi.mocked(prisma.team.findUnique).mockResolvedValue(null);
      await expect(assertTeamBelongsToOffering(1, 2)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws when offering mismatches', async () => {
      vi.mocked(prisma.team.findUnique).mockResolvedValue({
        courseOfferingId: 9,
      } as never);

      await expect(assertTeamBelongsToOffering(1, 2)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('resolves when offering matches', async () => {
      vi.mocked(prisma.team.findUnique).mockResolvedValue({
        courseOfferingId: 2,
      } as never);

      await expect(
        assertTeamBelongsToOffering(1, 2),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertTeamReadableByUser', () => {
    const team = {
      courseOfferingId: 11,
      members: [{ userId: 99 }],
    };

    it('treats admins as teaching staff without querying enrollment', async () => {
      const result = await assertTeamReadableByUser({
        userId: 5,
        isAdmin: true,
        team,
      });

      expect(result).toEqual({
        isTeachingStaff: true,
        isTeamMember: false,
      });
      expect(prisma.courseOfferingEnrollment.findMany).not.toHaveBeenCalled();
    });

    it('allows team members even when not teaching staff', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([]);

      const result = await assertTeamReadableByUser({
        userId: 99,
        isAdmin: false,
        team,
      });

      expect(result.isTeamMember).toBe(true);
      expect(result.isTeachingStaff).toBe(false);
    });

    it('allows teaching staff who are not members', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'TA' } as never,
      ]);

      const result = await assertTeamReadableByUser({
        userId: 50,
        isAdmin: false,
        team,
      });

      expect(result.isTeachingStaff).toBe(true);
      expect(result.isTeamMember).toBe(false);
    });

    it('denies viewers who lack membership or staff role', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([]);

      await expect(
        assertTeamReadableByUser({
          userId: 50,
          isAdmin: false,
          team,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
