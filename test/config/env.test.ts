import { describe, expect, it } from 'vitest';

import { loadEnv, resetEnvCache } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('throws when ACCESS_TOKEN_SECRET is too short', () => {
    resetEnvCache();
    const prev = process.env.ACCESS_TOKEN_SECRET;
    process.env.ACCESS_TOKEN_SECRET = 'short';
    expect(() => loadEnv()).toThrow();
    process.env.ACCESS_TOKEN_SECRET = prev;
    resetEnvCache();
  });

  it('parses a valid environment', () => {
    resetEnvCache();
    process.env.DATABASE_URL = 'file:./prisma/test.sqlite';
    process.env.ACCESS_TOKEN_SECRET = 'valid-secret-16chars';
    const env = loadEnv();
    expect(env.DATABASE_URL).toBe('file:./prisma/test.sqlite');
    resetEnvCache();
  });
});
