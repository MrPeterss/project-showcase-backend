# Semesters (`src/semesters/`)

## Overview

CRUD semantics for **`Semester`** entities (**season/year windows**) referenced during **`CourseOffering`** creation.

Reads are mostly open to authenticated clients; several **mutation** paths require admins.

## File layout

| File | Responsibility |
|------|----------------|
| [`semesterRouter.ts`](../src/semesters/semesterRouter.ts) | Express routes |
| [`semesterController.ts`](../src/semesters/semesterController.ts) | Translates HTTP → Prisma |
| [`semester.schema.ts`](../src/semesters/semester.schema.ts) | Body validation (**`semesterSchema`**) |

## How it fits

Mounted at **`/semesters`** after global JWT auth (**[middleware](./middleware.md)**).

## API surface (`/semesters`)

| Method | Path | Middleware / notes |
|--------|------|--------------------|
| `GET` | `/semesters/` | Any authenticated caller |
| `GET` | `/semesters/:semesterId` | **`requireAdmin`** (**note:** detail fetch restricted) |
| `POST` | `/semesters/` | **`requireAdmin`** + **`semesterSchema`** |
| `PUT` | `/semesters/:semesterId` | **`requireAdmin`** + **`semesterSchema`** |
| `DELETE` | `/semesters/:semesterId` | **`requireAdmin`** |

> As of router review, `:semesterId` paths **lack** **`validateRequest` param coercion** (**uses controller parsing**)—when extending, migrate to **`semesterIdParam`** (**[schemas](./schemas.md)**) parity with other routers for consistent errors.

## Development guide

1. When adding relational data (tie-breakers per academic calendar), migrate Prisma **`Semester`** first.
2. Expand **`semester.schema.ts`** and unit tests before widening controller branching.
3. Keep **bulk listing** **`GET /`** efficient (avoid deep includes unless responding to `/me` dashboards).

Prefer surfacing semesters through UI admin flows alongside **`courseOffering` creation UX**.

## Authorization

**`requireAdmin`** guards mutating verbs + detail fetch (**see **`semesterRouter`** for latest truth**).

Offering-level guards typically redundant here.

## Testing

| File |
|------|
| [`test/semesters/semesterRouter.http.test.ts`](../test/semesters/semesterRouter.http.test.ts) |
| [`test/semesters/semester.schema.test.ts`](../test/semesters/semester.schema.test.ts) |

## Related docs

- [courseOfferings.md](./courseOfferings.md)
