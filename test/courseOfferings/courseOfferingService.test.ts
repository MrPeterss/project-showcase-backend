import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

const { cleanupCourseOfferingContainers } = vi.hoisted(() => {
  const cleanupCourseOfferingContainers = vi.fn().mockResolvedValue(undefined);
  return { cleanupCourseOfferingContainers };
});

vi.mock('../../src/projects/containerService.js', () => ({
  cleanupCourseOfferingContainers,
}));

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import { deleteCourseOfferingWithCleanup } from '../../src/courseOfferings/courseOfferingService.js';

describe('courseOfferingService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    cleanupCourseOfferingContainers.mockClear();
    vi.mocked(prismaMock.project.deleteMany as Mock).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prismaMock.teamMembership.deleteMany as Mock).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prismaMock.team.deleteMany as Mock).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prismaMock.courseOfferingEnrollment.deleteMany as Mock).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prismaMock.courseOffering.delete as Mock).mockResolvedValue({} as never);
  });

  it('deleteCourseOfferingWithCleanup runs container cleanup then deletes in order', async () => {
    await deleteCourseOfferingWithCleanup(11);

    expect(cleanupCourseOfferingContainers).toHaveBeenCalledWith(11);
    expect(prismaMock.project.deleteMany).toHaveBeenCalled();
    expect(prismaMock.teamMembership.deleteMany).toHaveBeenCalled();
    expect(prismaMock.team.deleteMany).toHaveBeenCalled();
    expect(prismaMock.courseOfferingEnrollment.deleteMany).toHaveBeenCalled();
    expect(prismaMock.courseOffering.delete).toHaveBeenCalledWith({
      where: { id: 11 },
    });
  });
});
