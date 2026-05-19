# Spark (`src/spark/`)

## Overview

Operational integration with **Cornell Spark** credentialing: instructors/admins mint API keys scoped to **`CourseOffering`**, revoke keys, and query usage statistics aggregates.

Mounted **only under** **`/course-offerings/:offeringId/spark`** with **`mergeParams: true`** so nested **`offeringId`** propagates cleanly.

## File layout

| File | Responsibility |
|------|----------------|
| [`sparkRouter.ts`](../src/spark/sparkRouter.ts) | Sub-router (**keys** CRUD surface) |
| [`sparkController.ts`](../src/spark/sparkController.ts) | HTTP boundary + **`assertInstructorOrAdmin`** gating patterns |
| [`sparkService.ts`](../src/spark/sparkService.ts) | Outbound HTTPS client + Prisma lookups & reconciliations |
| [`spark.schema.ts`](../src/spark/spark.schema.ts) | **`issueSparkKeysSchema`**, key param validations |

Secrets / base URLs originate from environment (**inspect service** once editing).

## Effective API prefix

Base **`/course-offerings/:offeringId/spark`**.

| Method | Path suffix | Validates |
|--------|-------------|-----------|
| `POST` | `/keys` | **`issueSparkKeysSchema`** (**optional **`teamIds` subset**) |
| `GET` | `/keys` | **`sparkOfferingParamsSchema`** (**offering id passthrough**) |
| `GET` | `/keys/stats` | same |
| `DELETE` | `/keys/:sparkKeyId` | **`sparkKeyParamsSchema`** |
| `GET` | `/keys/:sparkKeyId/stats` | **`sparkKeyParamsSchema`** |

Consult controller/service for synchronous vs batched outbound behavior & error normalization.

## How it fits

Parent mount: **`courseOfferingRouter`**:

```typescript
router.use('/:offeringId/spark', sparkRouter)
```

Depends on **`prisma`** (**teams linking**) + remote Spark HTTP API.

## Authorization

Controllers assert **instructor/teaching privileges** aligning with **`assertInstructorOrAdmin`** (**[authorizationHelpers](./utils.md)**) — revisit when distinguishing **pure viewers**.

## Development guide

1. Add environment variables centrally (prefer **[config](./config.md)** tightening if URLs become mandatory).
2. Extend remote DTO adapters in **`sparkService`** with isolated pure functions (**facilitates tests**).
3. Keep routers thin—heavy retry logic stays service-side.
4. When bulk issuing keys, reuse existing schema optional arrays instead of bespoke query strings (**REST consistency**).

## Testing

| File |
|------|
| [`test/spark/sparkRouter.http.test.ts`](../test/spark/sparkRouter.http.test.ts) |
| [`test/spark/sparkService.test.ts`](../test/spark/sparkService.test.ts) |

## Related docs

- [courseOfferings.md](./courseOfferings.md)
