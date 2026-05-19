# Config (`src/config/`)

## Overview

Environment validation with **Zod** at bootstrap. [`loadEnv()`](../src/config/env.ts) parses **`process.env`**, caches success, and [`getEnv()`](../src/config/env.ts) returns immutable cached config thereafter. **`resetEnvCache()`** resets state for isolated Vitest cases.

## File layout

| File | Responsibility |
|------|----------------|
| [`env.ts`](../src/config/env.ts) | **`envSchema`**, `loadEnv`, `getEnv`, `resetEnvCache`, exported **`AppEnv` type |

## Currently validated variables

Declared in **`envSchema`** (see [`env.ts`](../src/config/env.ts) for authoritative list):

| Variable | Notes |
|-----------|-------|
| `NODE_ENV` | Optional enum: **`development`** \| **`production`** \| **`test`** |
| `PORT` | Optional string (`server.ts` parses `process.env.PORT` again) |
| `DATABASE_URL` | **Required**, non-empty (Prisma uses it) |
| `ACCESS_TOKEN_SECRET` | **Required**, **≥ 16** chars (`requireAuth`) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Optional (defaults documented in firebase module) |
| `DATA_FILES_DIR` | Optional (**project uploads** default path) |
| `DATA_FILES_HOST_DIR` | Optional (host-side bind mount counterpart) |
| `DOCKER_SOCKET_PATH` | Optional (Docker unix socket override) |

**Other environment variables** (rate limits, Prisma logs, Spark URLs, admin lists, …) might still appear in **`process.env`** and are enforced elsewhere or implicitly optional—check domain modules (`sparkService`, middleware, prisma client, …) when adding knobs.

Also see the richer table in **[`README.md`](../README.md)** for operator-facing documentation.

## How it fits

- [`server.ts`](../src/server.ts) invokes **`loadEnv()`** immediately after imports configure `dotenv`.
- Middleware like [`authentication.ts`](../src/middleware/authentication.ts) calls **`getEnv()`** assuming startup already validated required secrets.

## Development guide

### Add a strictly required startup variable

1. Extend **`envSchema`** in [`env.ts`](../src/config/env.ts) with **`z.string().min(1)`** or stricter validators.
2. Document it in **`README.md`** env table **and** optionally in the relevant module guide.
3. Access via **`getEnv().YOUR_FIELD`** anywhere after **`loadEnv()`**.

### Provide optional configuration with sane defaults

```typescript
optionalFlag: z
  .string()
  .optional()
  .transform((v) => v === 'true'),
```

(or keep reading `process.env` directly inside the module—pick one convention for discoverability.)

### Testing

Vitest **`test/setup.ts`** calls **`resetEnvCache()`**, seeds **`DATABASE_URL`** and **`ACCESS_TOKEN_SECRET`**, then invokes **`loadEnv()`** fresh each **`beforeEach`**.

| Test |
|------|
| [`test/config/env.test.ts`](../test/config/env.test.ts) |

## Related docs

- [middleware.md](./middleware.md)
- [core.md](./core.md)
