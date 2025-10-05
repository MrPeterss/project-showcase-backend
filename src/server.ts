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
app.use(requestLogger);
app.use(helmet());
app.use(express.json());

const router = express.Router();
router.use(apiLimiter);

// Public routes (no authentication required)
router.get('/', (_: Request, res: Response) => {
  res.send('Hello world from Express!');
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
