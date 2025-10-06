import 'dotenv/config';
import helmet from 'helmet';

import express from 'express';
import type { Request, Response } from 'express';

import adminRouter from './admin/adminRouter.js';
import { authenticateFirebase } from './middleware/authentication.js';
import { requestLogger } from './middleware/logger.js';
import { apiLimiter, userLimiter } from './middleware/rateLimit.js';
import userRouter from './users/userRouter.js';

const app = express();

// Trust proxy - necessary when behind a reverse proxy (nginx)
app.set('trust proxy', 1);

app.use(requestLogger);
app.use(helmet());
app.use(express.json());

const router = express.Router();
router.use(apiLimiter);

// Health check endpoint
router.get('/health', (_: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Protected routes (require authentication)
router.use(authenticateFirebase);
router.use(userLimiter);
router.use('/admin', adminRouter);
router.use('/users', userRouter);

app.use(router);

const port = process.env.PORT || '8000';

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
