import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import { addStudentEnrollment } from '../../src/enrollment/enrollmentService.js';

describe('enrollmentService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  it('addStudentEnrollment creates row without viewer grants for TA role', async () => {
    const row = {
      id: 99,
      userId: 1,
      courseOfferingId: 2,
      role: 'TA',
      referringCourseId: null,
    };
    vi.mocked(prismaMock.courseOfferingEnrollment.create as Mock).mockResolvedValue(
      row as never,
    );

    const out = await addStudentEnrollment(1, 2, 'TA');
    expect(out.role).toBe('TA');
    expect(prismaMock.courseOfferingEnrollment.create).toHaveBeenCalled();
    expect(prismaMock.courseOffering.findUnique).not.toHaveBeenCalled();
  });
});
