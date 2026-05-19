# Enrollment (`src/enrollment/`)

## Overview

Manipulates **`CourseOfferingEnrollment`** records (students, TAs, instructors, viewers…) including **bulk creation**, role updates, and deletes. Enrollment rows drive nearly all **`authorization`** decisions deeper in routers.

⚠️ **Canonical HTTP paths** nest under **`/course-offerings/:offeringId/enrollments`** via [`courseOfferingRouter.ts`](../src/courseOfferings/courseOfferingRouter.ts). A secondary mount at **`/enrollments`** exists for historical compatibility (**see caveat below**).

## File layout

| File | Responsibility |
|------|----------------|
| [`enrollmentController.ts`](../src/enrollment/enrollmentController.ts) | HTTP handlers (**expects validated `offeringId`**) |
| [`enrollmentService.ts`](../src/enrollment/enrollmentService.ts) | Business rules (**viewer grants**, dedupe safeguards) |
| [`enrollment.schema.ts`](../src/enrollment/enrollment.schema.ts) | Bulk create/update Zod schemas + composite params (**`offeringId` + `userId`**) |
| [`enrollmentRouter.ts`](../src/enrollment/enrollmentRouter.ts) | Router mounted standalone at **`/enrollments`** (**no parent param validation**) |

## How it fits

- **Preferred wiring:** **`courseOfferingRouter`** applies **`courseOfferingParamsSchema`** before invoking controller handlers.
- **`app.ts`** also **`router.use('/enrollments', enrollmentRouter)`** — this router exposes relative paths **`/`**, **`/:userId`**, **without** automatically validating `:offeringId` in `params`** because Express does not magically inject absent segments. Clients using **`/enrollments`** in isolation risk **`validated` mismatches**.

**Recommendation:** Implement new features strictly under **`/course-offerings/:offeringId/...`**; treat **`/enrollments`** mount as legacy unless you refactor it to duplicate param validation externally.

Controllers import **[`courseOfferingGuards`](../src/authorization/courseOfferingGuards.ts)** (**[authorization](./authorization.md)**) and **`utils/authorizationHelpers`** for **`assertInstructorOrAdmin`** style workflows.

Cross-feature **settings** integrations (e.g. granting viewer enrollment when **`course_visibility`** toggles) live partially in **`enrollmentService`** + **`courseOfferingSettings`**—read both when touching visibility.

## API surface (**canonical nesting**)

Assume prefix **`/course-offerings/:offeringId`**.

| Method | Path | Middleware stack (outer router) |
|--------|------|----------------------------------|
| `GET` | `/enrollments` | **`courseOfferingParamsSchema`** |
| `POST` | `/enrollments` | offerings params + **`createEnrollmentsSchema`** |
| `PUT` | `/enrollments/:userId` | **`enrollmentParamsSchema`** + **`updateEnrollmentSchema`** |
| `DELETE` | `/enrollments/:userId` | **`enrollmentParamsSchema`** |

## Development guide

1. Extend Zod schemas in **`enrollment.schema.ts`** (**avoid stringly-typed role updates**—use **`constants/roles`** arrays).
2. Register route on **`courseOfferingRouter`**—not only **`enrollmentRouter`**—unless you intentionally modernize/remove legacy mounting.
3. Put multi-record transactional writes in **`enrollmentService`** (reuse **`grantViewerEnrollments`** style helpers vs copy/paste loops).
4. After changing roster semantics, update Vitest **`courseOffering`** HTTP suites for regression signal.

See **[courseOfferings](./courseOfferings.md)** for offering-level settings interplay.

### Related routing reference

Roster-focused routes intentionally nest under **`/course-offerings/:offeringId`** so `:offeringId` is validated on every enrollment handler—see **[courseOfferings](./courseOfferings.md)** and **[authorization](./authorization.md)**.

## Authorization

Typically:

- **`assertOfferingAccessForUser`** with **`instructorOnly`** / **`teachingStaff`** gates for destructive operations (**see controller for exact combos**).

Admin bypass patterns often mirrored with **`assertInstructorOrAdmin`** or manual **`isAdmin`** checks.

## Testing

| Focus | File |
|-------|------|
| Service pure logic | [`test/enrollment/enrollmentService.test.ts`](../test/enrollment/enrollmentService.test.ts) |
| Nested HTTP coupling | [`test/courseOfferings/courseOfferingRouter.http.test.ts`](../test/courseOfferings/courseOfferingRouter.http.test.ts) |

## Related docs

- [authorization.md](./authorization.md)
- [courseOfferings.md](./courseOfferings.md)
- [constants.md](./constants.md)
