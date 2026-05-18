import 'dotenv/config';

import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { initFirebase } from './firebase.js';
import {
  startContainerMonitor,
  startProjectPruner,
  stopContainerMonitor,
  stopProjectPruner,
} from './projects/containerMonitor.js';
import { prisma } from './prisma.js';

loadEnv();

if (process.env.NODE_ENV !== 'test') {
  initFirebase();
}

const app = createApp();

const port = process.env.PORT || '8000';

const server = app.listen(port, async () => {
  console.log(`Express app listening at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }

  startContainerMonitor();
  startProjectPruner();
});

const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');

  stopContainerMonitor();
  stopProjectPruner();

  server.close(async () => {
    console.log('HTTP server closed');

    await prisma.$disconnect();
    console.log('Database disconnected');

    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
