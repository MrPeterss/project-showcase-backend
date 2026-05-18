import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { loadEnv, resetEnvCache } from '../src/config/env.js';

/** Writable upload dir before routers import-time mkdir (see projectRouter). */
const testUploadDir = path.join(process.cwd(), 'tmp', 'test-project-data-files');
fs.mkdirSync(testUploadDir, { recursive: true });
process.env.DATA_FILES_DIR ??= testUploadDir;

beforeEach(() => {
  resetEnvCache();
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'file:./prisma/test.sqlite';
  process.env.ACCESS_TOKEN_SECRET ??=
    'unit-test-access-secret-minimum-16chars';
  // Middleware (e.g. requireAuth) calls getEnv(); repopulate cache after reset.
  loadEnv();
});

afterEach(() => {
  resetEnvCache();
});
