import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    courseOfferingEnrollment: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/prisma.js';
import {
  assertInstructorOrAdmin,
  checkCourseOfferingAccess,
  getHighestAccessEnrollment,
} from '../../src/utils/authorizationHelpers.js';

describe('authorizationHelpers', () => {
  beforeEach(() => {
    vi.mocked(prisma.courseOfferingEnrollment.findMany).mockReset();
  });

  describe('getHighestAccessEnrollment', () => {
    it('returns null when user has no enrollments', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([]);
      await expect(getHighestAccessEnrollment(1, 2)).resolves.toBeNull();
    });

    it('prefers instructor over student when multiple roles exist', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'STUDENT' } as never,
        { role: 'INSTRUCTOR' } as never,
      ]);

      const row = await getHighestAccessEnrollment(1, 2);
      expect(row?.role).toBe('INSTRUCTOR');
    });
  });

  describe('checkCourseOfferingAccess', () => {
    it('filters by requiredRoles when provided', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'STUDENT' } as never,
      ]);

      await expect(
        checkCourseOfferingAccess(1, 2, ['INSTRUCTOR']),
      ).resolves.toBeNull();

      await expect(
        checkCourseOfferingAccess(1, 2, ['STUDENT']),
      ).resolves.toEqual(expect.objectContaining({ role: 'STUDENT' }));
    });
  });

  describe('assertInstructorOrAdmin', () => {
    it('no-ops for admins without querying enrollments', async () => {
      await expect(
        assertInstructorOrAdmin(1, true, 99),
      ).resolves.toBeUndefined();
      expect(prisma.courseOfferingEnrollment.findMany).not.toHaveBeenCalled();
    });

    it('passes when user is instructor', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'INSTRUCTOR' } as never,
      ]);

      await expect(
        assertInstructorOrAdmin(5, false, 10),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenError when neither admin nor instructor', async () => {
      vi.mocked(prisma.courseOfferingEnrollment.findMany).mockResolvedValue([
        { role: 'STUDENT' } as never,
      ]);

      await expect(assertInstructorOrAdmin(5, false, 10)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
