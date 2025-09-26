import express from 'express';
import admin from 'firebase-admin';
import userRouter from './users/userRouter';
import { apiLimiter } from './middleware/rateLimit';
import adminRouter from './admin/adminRouter';
import teamRouter from './teams/teamRouter';
import projectRouter from './projects/projectRouter';
import containerRouter from './containers/containerRouter';
import serviceAccount from '../firebase-service-account.json' assert { type: 'json' };

const app = express();
app.use(express.json());
app.use('/api', apiLimiter);
const port = 3000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

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
