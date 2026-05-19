# Legacy projects (`src/oldProjects/`)

## Overview

Historical **alternate Docker build pipelines** for legacy JSON/SQL shaped student submissions (**`buildOldJson`**, **`buildOldSql`**). Separate from **[modern `/projects`](./projects.md)** flow but mounted alongside under `/projects`.

## File layout

| File | Responsibility |
|------|----------------|
| [`oldProjectRouter.ts`](../src/oldProjects/oldProjectRouter.ts) | Registers legacy POST builders |
| [`oldProjectController.ts`](../src/oldProjects/oldProjectController.ts) | Validates + forwards to services |
| [`oldProjectService.ts`](../src/oldProjects/oldProjectService.ts) | Git clone / docker orchestration specific to formats |
| [`oldProject.schema.ts`](../src/oldProjects/oldProject.schema.ts) | **`buildOldProjectSchema`** (**`teamId` + `githubUrl`**) |

## How it fits

Mounted in [`app.ts`](../src/app.ts):

```typescript
router.use('/projects/legacy', oldProjectRouter)
```

Distinct from **`/projects`** (**no `/legacy` duplication of modern deploy**)—clients must pick correct subtree.

Depends on **`docker`**, **`git`**, **`prisma`**, status constants, and **`projectDockerOps`** helpers when shared.

## API surface (`/projects/legacy`)

**Auth:** `requireAuth` + **`requireAdmin` on each POST handler**.

| Method | Path | Payload |
|--------|------|---------|
| `POST` | `/build-old-json` | **`teamId`, `githubUrl`** validated |
| `POST` | `/build-old-sql` | same |

Prefer keeping **destructive infra** gated **admin-only** (**router already enforces**).

## Development guide

1. Add new compatibility endpoints here **only when** bridging historical formats—not for net-new student flows (**use **`projects`** instead**).

2. Reuse **`buildOldProjectSchema`** fields when possible; widen schema thoughtfully (**never accept arbitrary shell fragments**).


3. When adjusting Docker sequencing, isolate differences in **`oldProjectService`** to avoid regressing **`projectDeploy`** modern path.


4. Log verbosely (**service**) but map user-facing **`AppError`** codes consistently.

## Testing

| File |
|------|
| [`test/oldProjects/oldProjectService.test.ts`](../test/oldProjects/oldProjectService.test.ts) |

(No dedicated HTTP Vitest harness yet.)

## Related docs

- [projects.md](./projects.md)
- [admin.md](./admin.md)
