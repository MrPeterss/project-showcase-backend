import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';
import { signTestJwt } from '../helpers/signTestJwt.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/middleware/logger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createApp } from '../../src/app.js';

const adminAuth = () => ({
  Authorization: `Bearer ${signTestJwt({ userId: 1, isAdmin: true })}`,
});

const studentAuth = (userId: number) => ({
  Authorization: `Bearer ${signTestJwt({ userId, isAdmin: false })}`,
});

describe('courseOfferingRouter HTTP', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    vi.mocked(prismaMock.$queryRaw as Mock).mockResolvedValue(1);
  });

  describe('GET /course-offerings', () => {
    it('returns all offerings for admins', async () => {
      vi.mocked(prismaMock.courseOffering.findMany as Mock).mockResolvedValue([
        {
          id: 1,
          settings: {},
          createdAt: new Date(),
          courseId: 10,
          semesterId: 20,
          course: { id: 10, name: 'c', number: 1000, department: 'CS', createdAt: new Date() },
          semester: {
            id: 20,
            season: 'Fall',
            year: 2026,
            startDate: new Date(),
            endDate: new Date(),
            createdAt: new Date(),
          },
        },
      ]);

      const res = await request(createApp()).get('/course-offerings').set(adminAuth()).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].userRole).toBe('ADMIN');
    });

    it('returns enrolled offerings for students', async () => {
      vi.mocked(prismaMock.courseOfferingEnrollment.findMany as Mock).mockResolvedValue([
        {
          role: 'STUDENT',
          courseOffering: {
            id: 2,
            settings: {},
            createdAt: new Date(),
            courseId: 10,
            semesterId: 20,
            course: { id: 10, name: 'c', number: 1000, department: 'CS', createdAt: new Date() },
            semester: {
              id: 20,
              season: 'Fall',
              year: 2026,
              startDate: new Date(),
              endDate: new Date(),
              createdAt: new Date(),
            },
          },
        },
      ]);

      const res = await request(createApp()).get('/course-offerings').set(studentAuth(99)).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].userRole).toBe('STUDENT');
    });

    it('filters student offerings by optional role query', async () => {
      vi.mocked(prismaMock.courseOfferingEnrollment.findMany as Mock).mockResolvedValue([]);

      await request(createApp()).get('/course-offerings?role=TA').set(studentAuth(5)).expect(200);

      expect(prismaMock.courseOfferingEnrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 5,
            role: 'TA',
          }),
        }),
      );
    });
  });

  describe('GET /course-offerings/:offeringId', () => {
    const offeringPayload = {
      id: 8,
      settings: {},
      createdAt: new Date(),
      courseId: 1,
      semesterId: 2,
      course: { id: 1, name: 'c', number: 1111, department: 'CS', createdAt: new Date() },
      semester: {
        id: 2,
        season: 'Fall',
        year: 2026,
        startDate: new Date(),
        endDate: new Date(),
        createdAt: new Date(),
      },
      enrollments: [],
    };

    it('returns detail for admins', async () => {
      vi.mocked(prismaMock.courseOffering.findUnique as Mock).mockResolvedValue(offeringPayload);

      const res = await request(createApp()).get('/course-offerings/8').set(adminAuth()).expect(200);

      expect(res.body.userRole).toBe('ADMIN');
      expect(res.body.enrollments).toBeDefined();
    });

    it('returns detail for enrolled students without roster when not staff', async () => {
      vi.mocked(prismaMock.courseOffering.findUnique as Mock).mockResolvedValue(offeringPayload);
      vi.mocked(prismaMock.courseOfferingEnrollment.findMany as Mock).mockResolvedValue([
        { role: 'STUDENT' },
      ]);

      const res = await request(createApp()).get('/course-offerings/8').set(studentAuth(7)).expect(200);

      expect(res.body.userRole).toBe('STUDENT');
      expect(res.body.enrollments).toBeUndefined();
    });

    it('403 when student not enrolled', async () => {
      vi.mocked(prismaMock.courseOffering.findUnique as Mock).mockResolvedValue(offeringPayload);
      vi.mocked(prismaMock.courseOfferingEnrollment.findMany as Mock).mockResolvedValue([]);

      await request(createApp()).get('/course-offerings/8').set(studentAuth(7)).expect(403);
    });
  });

  describe('GET /course-offerings/:offeringId/enrollments', () => {
    it('lists enrollments for admins', async () => {
      vi.mocked(prismaMock.courseOffering.findUnique as Mock).mockResolvedValue({ id: 11 });
      vi.mocked(prismaMock.courseOfferingEnrollment.findMany as Mock).mockResolvedValue([]);

      await request(createApp()).get('/course-offerings/11/enrollments').set(adminAuth()).expect(200);
    });
  });
});
