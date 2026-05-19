# Core (`src/` entry points & singletons)

## Overview

The HTTP API is assembled in **`app.ts`**, started in **`server.ts`**, and backed by singleton clients for **Prisma**, **Docker**, **Firebase Admin**, and **Git**. Keeping `createApp()` separate from `listen()` lets tests mount the full router stack via **supertest** without opening a TCP port.

## File layout

| File | Role |
|------|------|
| [`app.ts`](../src/app.ts) | `createApp()`: middleware, route mounting, health check |
| [`server.ts`](../src/server.ts) | Process entry: env, Firebase init, HTTP server, DB connect, background crons |
| [`prisma.ts`](../src/prisma.ts) | Shared `PrismaClient` singleton (logging tuned by env) |
| [`docker.ts`](../src/docker.ts) | Shared Dockerode client; test hook `setDockerClientForTesting` |
| [`firebase.ts`](../src/firebase.ts) | Lazy Firebase Admin init from service account JSON |
| [`git.ts`](../src/git.ts) | Default `simple-git` instance plus re-export |

## How it fits

- [`server.ts`](../src/server.ts) imports `dotenv/config` implicitly (via `'dotenv/config'`), runs [`loadEnv()`](../src/config/env.ts) **before** `createApp()`, then starts [`containerMonitor`](../src/projects/containerMonitor.ts).
- Routers imported from domains (e.g. [`projectRouter.ts`](../src/projects/projectRouter.ts)) receive `express.json({ limit: '1mb' })` and authenticated context from middleware applied in [`app.ts`](../src/app.ts).

## Middleware order in `createApp()` (summary)

1. `requestLogger`
2. `helmet()`
3. `express.json({ limit: '1mb' })`
4. `cookieParser()`
5. Inner `Router`: **`GET /health`** (Prisma ping) → **`/auth`** (public) → **`requireAuth`** → **`userRateLimiter`** → protected mounts → `globalErrorHandler` after mount

Public vs protected behavior is spelled out line-by-line in [`app.ts`](../src/app.ts).

### Health check

[`GET /health`](../src/app.ts) returns JSON with uptime and **`database: connected`** if `SELECT 1` succeeds; **`503`** with **`unhealthy`** if the DB is unreachable.

There is **no `/api` prefix** — routes are mounted at the application root (`/courses`, `/projects`, etc.).

## `server.ts` lifecycle

1. **`loadEnv()`** — validates required env vars (see [config.md](./config.md))
2. **`initFirebase()`** — skipped when `NODE_ENV === 'test'`
3. **`createApp()`** → **`app.listen(PORT)`** (default **`8000`** if `PORT` unset)
4. **`prisma.$connect()`** inside listen callback — process exits **`1`** on failure
5. **`startContainerMonitor()`**, **`startProjectPruner()`** — background reconciliation of Docker vs DB project state

**Graceful shutdown** (`SIGTERM` / `SIGINT`): stops crons → closes HTTP → **`prisma.$disconnect()`**. A **10s** timeout forces exit if shutdown stalls.

## Prisma singleton

[`prisma.ts`](../src/prisma.ts):

- Enables **error/warn** logging by default; **queries** log only when `PRISMA_LOG_QUERIES === 'true'` **and** `NODE_ENV === 'development'`
- Reuses **`globalThis.prisma`** in non-production to survive dev hot reloads

## Docker client

[`docker.ts`](../src/docker.ts) exposes mutable **`docker`**. Prefer **`setDockerClientForTesting(null)`** in teardown to restore a real client. Optional **`DOCKER_SOCKET_PATH`** selects a Unix socket explicitly.

## Firebase Admin

[`initFirebase()`](../src/firebase.ts) reads **`FIREBASE_SERVICE_ACCOUNT_PATH`** (default `./firebase-service-account.json`). [`getFirebaseAdmin()`](../src/firebase.ts) throws if callers run before initialization.

Auth verification for login lives in **[auth](./auth.md)**.

## Git

[`git.ts`](../src/git.ts) exports a **`simple-git()`** instance used by **[projects](./projects.md)** to clone repos before **`docker build`**.

## Authorization

JWT population and guards are middleware/domain concerns; see [middleware](./middleware.md) and [authorization](./authorization.md).

## Testing

| Area | Typical tests |
|------|----------------|
| App wiring | [`test/app.test.ts`](../test/app.test.ts) |
| Env | [`test/config/env.test.ts`](../test/config/env.test.ts) |
| Docker socket helper | [`test/docker.test.ts`](../test/docker.test.ts) |
| Git export | [`test/git.test.ts`](../test/git.test.ts) |

**Note:** Vitest excludes [`server.ts`](../src/server.ts) from coverage thresholds in [`vitest.config.ts`](../vitest.config.ts); integration behavior is exercised through `createApp()` in HTTP tests.

## Related docs

- [README.md](./README.md) (index)
- [middleware.md](./middleware.md)
- [config.md](./config.md)
- [projects.md](./projects.md)
