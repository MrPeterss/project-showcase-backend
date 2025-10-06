import 'dotenv/config';
import helmet from 'helmet';

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma.js';

import adminRouter from './admin/adminRouter.js';
import teamRouter from './teams/teamRouter.js';
import courseRouter from './courses/courseRouter.js';
import { authenticateFirebase } from './middleware/authentication.js';
import { requestLogger } from './middleware/logger.js';
import { apiLimiter, userLimiter } from './middleware/rateLimit.js';

const app = express();

// Trust proxy - necessary when behind a reverse proxy (nginx)
app.set('trust proxy', 1);

app.use(requestLogger);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

const router = express.Router();
router.use(apiLimiter);

// Health check endpoint
router.get('/health', async (_: Request, res: Response) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: 'unknown'
  };

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.database = 'connected';
    res.status(200).json(healthCheck);
  } catch {
    healthCheck.status = 'unhealthy';
    healthCheck.database = 'disconnected';
    res.status(503).json(healthCheck);
  }
});

// Protected routes (require authentication)
router.use(authenticateFirebase);
router.use(userLimiter);
router.use('/admin', adminRouter);
router.use('/teams', teamRouter);
router.use('/courses', courseRouter);

app.use((err: Error, _req: Request, res: Response, _: NextFunction) => {
  console.error('Error:', err);
  
  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  });
});

app.use(router);

const port = process.env.PORT || '8000';

const server = app.listen(port, async () => {
  console.log(`Express app listening at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Verify database connection on startup
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Disconnect from database
    await prisma.$disconnect();
    console.log('Database disconnected');
    
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
