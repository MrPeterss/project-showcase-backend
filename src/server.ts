import express from 'express';
import firebaseAdmin from './firebase.js';
import userRouter from './users/userRouter.js';
import { apiLimiter } from './middleware/rateLimit.js';
import adminRouter from './admin/adminRouter.js';
import teamRouter from './teams/teamRouter.js';
import projectRouter from './projects/projectRouter.js';
import containerRouter from './containers/containerRouter.js';

const app = express();
app.use(express.json());
app.use('/api', apiLimiter);
const port = 3000;


app.get('/', (req, res) => {
  res.send('Hello world from Express!');
});

app.use('/api/admin', adminRouter);
app.use('/api/users', userRouter);
app.use('/api/teams', teamRouter);
app.use('/api/projects', projectRouter);
app.use('/api/containers', containerRouter);

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
});
