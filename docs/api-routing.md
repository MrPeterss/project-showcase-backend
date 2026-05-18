# API routing conventions

## Course offerings as the enrollment boundary

Most resources are scoped under **`/course-offerings/:offeringId`** when they logically belong to a specific offering (enrollments, nested teams listing, Spark keys, bulk tagging). Route handlers should validate `:offeringId` with shared Zod param helpers and enforce access with **`authorization/courseOfferingGuards`** (`assertCourseOfferingExists`, `assertOfferingAccessForUser`) so permission checks stay consistent.

## Teams: nested vs aggregate routes

- **Collection / offering context:** `GET|POST /course-offerings/:offeringId/teams` (and `.../teams/me`) operate in offering scope. Prefer **`assertOfferingAccessForUser`** (and **`assertTeamBelongsToOffering`** when a `teamId` is supplied alongside an offering id).
- **Team aggregate:** `GET|PUT|DELETE /teams/:teamId` and member routes operate on a single team by id. Authorization must go through **`authorization/teamAccess`** (`assertTeamReadableByUser` for reads; instructor/admin checks for destructive actions via **`assertInstructorOrAdmin`** in **`utils/authorizationHelpers`**).

Keeping both URL shapes avoids awkward URLs while **`teamAccess`** + **`courseOfferingGuards`** ensure one coherent security story.

## Legacy project builders

Historical **`build-old-json`** / **`build-old-sql`** endpoints live under **`/projects/legacy`** (see **`oldProjects/oldProjectRouter`**). Current deploy APIs remain under **`/projects`**.
