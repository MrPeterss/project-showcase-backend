import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import { tagCourseOfferingProjects } from '../../src/projects/projectTagService.js';

describe('projectTagService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  it('tagCourseOfferingProjects throws when course offering is missing', async () => {
    vi.mocked(prismaMock.courseOffering.findUnique as Mock).mockResolvedValue(null);

    await expect(tagCourseOfferingProjects(404, 'my-tag')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
