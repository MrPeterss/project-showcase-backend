# Utils (`src/utils/`)

## Overview

Typed HTTP errors (**`AppError` hierarchy**) and shared domain helpers (**authorization lookups**, **`project`** selection conventions, **Docker-safe team slugs**) reused across routers/services.

Avoid bloating controllers with repeated enrollment queries—reuse helpers consistently.

## File layout

| File | Responsibility |
|------|----------------|
| [`AppError.ts`](../src/utils/AppError.ts) | Base **`AppError`**, subclasses, optional machine-readable **`ErrorCodes`** |
| [`authorizationHelpers.ts`](../src/utils/authorizationHelpers.ts) | Prisma-backed role checks (**teaching staff**, **`assertInstructorOrAdmin`**, etc.) |
| [`projectUtils.ts`](../src/utils/projectUtils.ts) | **`getTeamPreferredProject`** (pick featured/running-ish project for responses) |
| [`teamAlias.ts`](../src/utils/teamAlias.ts) | Normalize team identifiers for Docker/container naming (**slug collision avoidance**) |

*(Names map to filenames—open files for exhaustive exports.)*

## Error handling conventions

Controllers/services **`throw`** specific subclasses (**`ForbiddenError`**, **`NotFoundError`**, **`ValidationError`**) instead of crafting raw **`res.status`** responses manually.

[`globalErrorHandler`](../src/middleware/errorHandler.ts) serializes **`AppError`** instances; anonymous errors collapse to sanitized messages depending on **`NODE_ENV`**.

## Authorization helper usage highlights

[`authorizationHelpers`](../src/utils/authorizationHelpers.ts) answers fine-grained questions like **`checkTeachingStaffAccess(userId, offeringId)`** used during **locked offering** deployments in **`projectDeploy`** (see **[projects](./projects.md)**).

Pair with **`authorization/`** coarse guards (**[authorization.md](./authorization.md)**) depending on layering needs.

### When to extend `authorizationHelpers`

Add a **`check*`** returning boolean **and** optionally an **`assert*`** wrapping throws when multiple endpoints repeat identical joins between **`User`**, **`CourseOfferingEnrollment`**, and offering settings.

### When to extend `authorization/`

Prefer when the abstraction is "**access to offering**" vs "**readable team**", not a nuanced role bitwise operation.

## `projectUtils`

Used when API responses expose a team's **effective project**: choosing among multiple historical deployments (**running** preferred, sensible fallback documented in source).

## `teamAlias`

Docker container naming derives from sanitized team identifiers to avoid clashes on shared infra.

## Testing

| File |
|------|
| [`test/utils/AppError.test.ts`](../test/utils/AppError.test.ts) |
| [`test/utils/authorizationHelpers.test.ts`](../test/utils/authorizationHelpers.test.ts) |
| [`test/utils/projectUtils.test.ts`](../test/utils/projectUtils.test.ts) |
| [`test/utils/teamAlias.test.ts`](../test/utils/teamAlias.test.ts) |

## Related docs

- [middleware.md](./middleware.md)
- [authorization.md](./authorization.md)
- [projects.md](./projects.md)
