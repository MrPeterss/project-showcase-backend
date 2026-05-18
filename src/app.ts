import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import express from 'express';
import type { Request, Response } from 'express';

import adminRouter from './admin/adminRouter.js';
import authRouter from './auth/authRouter.js';
import courseOfferingRouter from './courseOfferings/courseOfferingRouter.js';
import courseRouter from './courses/courseRouter.js';
import enrollmentRouter from './enrollment/enrollmentRouter.js';
import oldProjectRouter from './oldProjects/oldProjectRouter.js';
import { requireAdmin, requireAuth } from './middleware/authentication.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { userRateLimiter } from './middleware/rateLimit.js';
import { prisma } from './prisma.js';
import projectRouter from './projects/projectRouter.js';
import semesterRouter from './semesters/semesterRouter.js';
import teamRouter from './teams/teamRouter.js';
import userRouter from './users/userRouter.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const router = express.Router();

  router.get('/health', async (_: Request, res: Response) => {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: 'unknown',
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      healthCheck.database = 'connected';
      res.status(200).json(healthCheck);
    } catch {
      healthCheck.status = 'unhealthy';
      healthCheck.database = 'disconnected';
      res.status(503).json(healthCheck);
    }
  });

  router.use('/auth', authRouter);

  router.use(requireAuth);
  router.use(userRateLimiter);
  router.use('/admin', requireAdmin, adminRouter);
  router.use('/users', userRouter);
  router.use('/semesters', semesterRouter);
  router.use('/teams', teamRouter);
  router.use('/courses', courseRouter);
  router.use('/course-offerings', courseOfferingRouter);
  router.use('/enrollments', enrollmentRouter);
  router.use('/projects', projectRouter);
  router.use('/projects/legacy', oldProjectRouter);

  app.use(router);

  app.use(globalErrorHandler);

  return app;
}
