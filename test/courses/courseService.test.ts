import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    course: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/prisma.js';
import { getCourseByIdForAdmin } from '../../src/courses/courseService.js';

describe('getCourseByIdForAdmin', () => {
  beforeEach(() => {
    vi.mocked(prisma.course.findUnique).mockReset();
  });

  it('throws when course missing', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValue(null);
    await expect(getCourseByIdForAdmin(404)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns mapped payload when present', async () => {
    const row = {
      id: 3,
      name: 'Algo',
      number: 4820,
      department: 'CS',
      createdAt: new Date(),
      offerings: [],
    } as never;

    vi.mocked(prisma.course.findUnique).mockResolvedValue(row);

    await expect(getCourseByIdForAdmin(3)).resolves.toEqual(row);
  });
});
