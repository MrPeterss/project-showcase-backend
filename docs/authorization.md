# Authorization (`src/authorization/`)

## Overview

Reusable guards that answer “**can this user access this offering or team?**” layered on enrollment data. They complement lower-level helpers in [`authorizationHelpers.ts`](../src/utils/authorizationHelpers.ts) (role checks, **`assertInstructorOrAdmin`**).

Prefer these guards whenever multiple routes enforce the **same enrollment story** under **`/course-offerings`** or **`/teams`**.

## File layout

| File | Responsibility |
|------|----------------|
| [`courseOfferingGuards.ts`](../src/authorization/courseOfferingGuards.ts) | Course offering existence + enrollment-based visibility |
| [`teamAccess.ts`](../src/authorization/teamAccess.ts) | Team ↔ offering linkage + readability rules |

## `courseOfferingGuards`

- **`assertCourseOfferingExists(offeringId)`** — verifies the row exists (**`NotFound`** otherwise).

- **`assertOfferingAccessForUser({ userId, offeringId }, policy)`** — enrollment gate with selectable policy strings such as **`anyEnrollment`**, **`instructorOnly`**, **`teachingStaff`**. Also grants **admins** when appropriate (`isAdmin` on `User`, depending on helper usage).

Controllers for nested resources (teams, enrollment under an offering, Spark mounts) compose these assertions **before** Prisma-heavy work.

## `teamAccess`

- **`assertTeamBelongsToOffering(teamId, offeringId)`** — structural check that the team's `CourseOffering.id` matches the URL `:offeringId`.

- **`assertTeamReadableByUser({ userId, teamId[, offeringId] })`** — coherent read authorization for **`GET`** style operations (handles admin / teaching staff / membership / viewer semantics per implementation).

Teams documentation lists **when** aggregate `/teams/:teamId` vs nested `/course-offerings/:offeringId/teams` endpoints call which helper.

## How it fits

Used heavily by **`enrollment`** and **`teams`** controllers. **`projects`** controllers often call **`authorizationHelpers`** directly (deploy/stop paths also respect offering **locks** and admin/staff nuances).

**Routing conventions:**

- Enrollment boundary = **course offerings** — roster, nested teams listing, Spark, and bulk project tagging typically live under **`/course-offerings/:offeringId/...`**.
- **Aggregate team routes** — **`GET|PUT|DELETE /teams/:teamId`** and member routes operate by team id; use **`teamAccess`** so linkage to an offering stays consistent with nested routes (**[teams](./teams.md)**).

## Development guide

### Add a new offering-scoped read endpoint

1. Parse **`offeringId`** with Zod + [`paramCoercions`](./schemas.md).
2. Call **`await assertOfferingAccessForUser(..., 'anyEnrollment')`** (pick correct policy label from source).
3. Query Prisma/service.

### Add a mutation that mentions both `:offeringId` and `:teamId`

1. Enforce **`assertOfferingAccessForUser`** for instructor/teaching scopes.
2. Enforce **`assertTeamBelongsToOffering(teamId, offeringId)`** when both IDs appear together.

When you need **`assertInstructorOrAdmin`**-style shortcuts, reuse helpers from **`utils/authorizationHelpers.ts`** rather than duplicating enrollment queries.

### Add a wholly new guard

Prefer adding **`assert*` async functions returning `Promise<void>` throwing **`AppError`** subclasses for consistency (**[utils](./utils.md)**).

## Related docs

- [teams.md](./teams.md)
- [courseOfferings.md](./courseOfferings.md)
- [enrollment.md](./enrollment.md)

## Testing

| File |
|------|
| [`test/authorization/courseOfferingGuards.test.ts`](../test/authorization/courseOfferingGuards.test.ts) |
| [`test/authorization/teamAccess.test.ts`](../test/authorization/teamAccess.test.ts) |
| [`test/utils/authorizationHelpers.test.ts`](../test/utils/authorizationHelpers.test.ts) |
