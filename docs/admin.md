# Admin (`src/admin/`)

## Overview

Privileged **operations console** endpoints: coarse admin placeholders, **streaming system telemetry**, Docker-aware **migration**, **bulk pruning triggers**, **`User` lifecycle** (promote/demote, rename).

All routes inherit **JWT auth** globally and **explicit admin** middleware at **`/admin`** mount.

## File layout

| File | Responsibility |
|------|----------------|
| [`adminRouter.ts`](../src/admin/adminRouter.ts) | Route wiring + Zod validations |
| [`adminController.ts`](../src/admin/adminController.ts) | Handlers (some heavy Docker coupling) |
| [`adminService.ts`](../src/admin/adminService.ts) | User-centric DB mutations (**promote/demote/name**) |
| [`migrationService.ts`](../src/admin/migrationService.ts) | Project container migration orchestration (**`migrateProjectContainer`**) |
| [`systemInfoController.ts`](../src/admin/systemInfoController.ts) | **`/system/*` insight streams** (**SSE** semantics) |
| [`admin.schema.ts`](../src/admin/admin.schema.ts) | Zod for pruning/migration/name updates |

## How it fits

Mounted in [`app.ts`](../src/app.ts):

```typescript
router.use('/admin', requireAdmin, adminRouter);
```

Depends on **`prisma`**, **`docker`**, project maintenance hooks under **`projects/`**, and ancillary utilities (**`constants/projectStatus`**, **`teamAlias`**, containers monitor exports—see **[projects](./projects.md)** / **[migrationService source](../src/admin/migrationService.ts)** imports).

## API surface (`/admin`)

**Auth:** `requireAuth` (**Bearer**) + **`req.user.isAdmin`**.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/admin/stats` | Placeholder stub |
| `GET` | `/admin/settings` | Placeholder stub |
| `GET` | `/admin/audit-logs` | Placeholder stub |
| `GET` | `/admin/system/stream` | Live system telemetry stream (**see controller**) |
| `GET` | `/admin/system/storage` | Storage insight payload |
| `GET` | `/admin/resources/projects` | Non-hidden project inventory |
| `POST` | `/admin/projects/prune` | Bulk prune trigger (**async job**) |
| `POST` | `/admin/projects/:projectId/prune` | Single project pruning (**validated IDs**) |
| `POST` | `/admin/users/:userId/promote` | Promote **`User`** to admin |
| `POST` | `/admin/users/:userId/demote` | Demote admin (**guard rails in service**) |
| `PUT` | `/admin/users/:userId/name` | Validated rename |
| `POST` | `/admin/projects/migrate` | Run migration (**`migrateProjectSchema`**) |

## Development guide

1. Decide if work is pure **business DB** (**→ `adminService`**) vs **infra script** (**inline controller** today).
2. Add **Zod** schema entries to [`admin.schema.ts`](../src/admin/admin.schema.ts) when parsing bodies/query/params beyond existing patterns.
3. Register route in **`adminRouter`**.
4. If touching Docker/host resources, consolidate shared logic into **`migrationService`** or **`projects/containerService`** helpers to avoid divergence from student deploy workflows.

Prefer throwing **`AppError`** subclasses (**[utils](./utils.md)**).

## Authorization

Assume **caller is admin** because of **`requireAdmin` middleware**—but still sanity-check relational ownership when mutating **`Project`**/`User` combos to guard against SSRF-esque misuse paths.

## Testing

| File |
|------|
| [`test/admin/adminService.test.ts`](../test/admin/adminService.test.ts) |
| [`test/admin/migrationService.test.ts`](../test/admin/migrationService.test.ts) |

(No dedicated **`adminRouter` HTTP Vitest suite** currently—consider adding parity with other routers if expanding surface.)

## Related docs

- [core.md](./core.md)
- [projects.md](./projects.md)
