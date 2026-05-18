import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    courseOffering: {
      findUnique: vi.fn(),
    },
    courseOfferingEnrollment: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/prisma.js';
import {
  assertCourseOfferingExists,
  assertOfferingAccessForUser,
} from '../../src/authorization/courseOfferingGuards.js';

describe('courseOfferingGuards', () => {
  beforeEach(() => {
    vi.mocked(prisma.courseOffering.findUnique).mockReset();
    vi.mocked(prisma.courseOfferingEnrollment.findMany).mockReset();
  });

  describe('assertCourseOfferingExists', () => {
    it('throws NotFoundError when missing', async () => {
      vi.mocked(prisma.courseOffering.findUnique).mockResolvedValue(null);
      await expect(assertCourseOfferingExists(404)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns the offering row when present', async () => {
      const row = { id: 1 } as never;
      vi.mocked(prisma.courseOffering.findUnique).mockResolvedValue(row);
      await expect(assertCourseOfferingExists(1)).resolves.toEqual(row);
    });
  });

  describe('assertOfferingAccessForUser', () => {
    it('allows admins without enrollment lookup beyond existence check', async () => {
      vi.mocked(prisma.courseOffering.findUnique).mockResolvedValue({
        id: 9,
      } as never);

      await assertOfferingAccessForUser(1, 9, true, 'anyEnrollment');

      expect(prisma.courseOfferingEnrollment.findMany).not.toHaveBeenCalled();
    });

    it('allows any enrollment under anyEnrollment policy', async () => {
      vi.mocked(prisma.courseOffering.findUnique).mockResolvedValue({
        id: 9,
      } as never);
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'STUDENT' } as never,
      ]);

      await assertOfferingAccessForUser(2, 9, false, 'anyEnrollment');
    });

    it('forbids when policy requires instructor but user is only student', async () => {
      vi.mocked(prisma.courseOffering.findUnique).mockResolvedValue({
        id: 9,
      } as never);
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'STUDENT' } as never,
      ]);

      await expect(
        assertOfferingAccessForUser(2, 9, false, 'instructorOnly'),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
