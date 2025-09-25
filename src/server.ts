import express from 'express';
import { PrismaClient } from './generated/prisma/index.js'; 
import * as admin from 'firebase-admin';
import { authenticateFirebase } from './middleware/authMiddleware';

const app = express();
const prisma = new PrismaClient();
const port = 3000;
const serviceAccount = require('path/to/your/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.get('/', (req, res) => {
  res.send('Hello world from Express!');
});

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).send("Error fetching users");
  }
});

app.get('/api/protected/data', authenticateFirebase, (req, res) => {
  res.json({
    message: `Hello, ${(req as any).user.email}! This data is protected.`,
    uid: (req as any).user.uid
  });
});

app.listen(port, () => {
  console.log(`Express app listening at http://localhost:${port}`);
});
