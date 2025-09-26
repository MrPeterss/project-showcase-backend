import 'dotenv/config';
import express from 'express';
import userRouter from './users/userRouter.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/logger.js';
import adminRouter from './admin/adminRouter.js';
import teamRouter from './teams/teamRouter.js';
import projectRouter from './projects/projectRouter.js';
import containerRouter from './containers/containerRouter.js';

const app = express();
app.use(requestLogger);
app.use(express.json());

const router = express.Router();
router.use(apiLimiter);

router.get('/', (req, res) => {
  res.send('Hello world from Express!');
});

router.use('/admin', adminRouter);
router.use('/users', userRouter);
router.use('/teams', teamRouter);
router.use('/projects', projectRouter);
router.use('/containers', containerRouter);

app.use('/api', router);

const port = process.env.PORT || '3000';

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
