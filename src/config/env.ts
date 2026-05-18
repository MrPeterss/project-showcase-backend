import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ACCESS_TOKEN_SECRET: z.string().min(16, 'ACCESS_TOKEN_SECRET must be at least 16 characters'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  DATA_FILES_DIR: z.string().optional(),
  DATA_FILES_HOST_DIR: z.string().optional(),
  DOCKER_SOCKET_PATH: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

/**
 * Validates process.env once and caches the result. Call from server bootstrap before listen().
 */
export function loadEnv(): AppEnv {
  if (cachedEnv !== undefined) {
    return cachedEnv;
  }
  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}

export function getEnv(): AppEnv {
  if (cachedEnv === undefined) {
    throw new Error('Environment has not been validated; call loadEnv() first');
  }
  return cachedEnv;
}

/** Reset cached env (tests only). */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
