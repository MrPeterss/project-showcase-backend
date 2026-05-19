# Courses (`src/courses/`)

## Overview

Administrative CRUD against canonical **catalog `Course`** records (**name/code/department** scaffolding) independent of semester-specific **`CourseOffering`** instances.

Everything is **`requireAdmin`**-gated (**router attaches before each handler**).

## File layout

| File | Responsibility |
|------|----------------|
| [`courseRouter.ts`](../src/courses/courseRouter.ts) | REST table |
| [`courseController.ts`](../src/courses/courseController.ts) | Thin Prisma adapters |
| [`courseService.ts`](../src/courses/courseService.ts) | **`getCourseByIdForAdmin`** rich projections |
| [`courseMappers.ts`](../src/courses/courseMappers.ts) | Select fragments + **`toCourseAdminDetail`** transforms |
| [`courses.schema.ts`](../src/courses/courses.schema.ts) | Body **`courseSchema`** + **`courseParamsSchema`** |
| [`courseAdminDetail.schema.ts`](../src/courses/courseAdminDetail.schema.ts) | Zod mirrored admin view model |

## How it fits

Mounted at **`/courses`** behind global authenticated stack + **per-route admin** checks.

Schemas import **`courseIdParam`** from **[paramCoercions](./schemas.md)**.

## API surface (`/courses`)

**Auth:** `requireAuth` + **`requireAdmin` on each route.**

| Method | Path | Middleware |
|--------|------|------------|
| `GET` | `/courses/` | `requireAdmin` |
| `GET` | `/courses/:courseId` | `courseParamsSchema` |
| `POST` | `/courses/` | `courseSchema` |
| `PUT` | `/courses/:courseId` | params + **`courseSchema`** |
| `DELETE` | `/courses/:courseId` | `courseParamsSchema` |

## Development guide

1. Extend Prisma **`Course`** model when adding relational fields (**requires migration**) before surfacing APIs.
2. Update **`courses.schema.ts`** (**body**) and **`courseMappers`** if admin detail payloads widen.
3. Keep listing endpoints lean—defer heavy includes to **`getCourseByIdForAdmin`** to avoid **`N+1`** fetch storms.

Prefer returning shapes validated by **`courseAdminDetailSchema`** for consistency UI-side.

## Authorization

Assume **caller admin** (**router**)—still throw **`NotFoundError`** (**[utils](./utils.md)**) for missing IDs vs leaking existence.

## Testing

| File |
|------|
| [`test/courses/courseRouter.http.test.ts`](../test/courses/courseRouter.http.test.ts) |
| [`test/courses/courseService.test.ts`](../test/courses/courseService.test.ts) |
| [`test/courses/courseMappers.test.ts`](../test/courses/courseMappers.test.ts) |
| [`test/courses/courses.schema.test.ts`](../test/courses/courses.schema.test.ts) |
| [`test/courses/courseAdminDetail.schema.test.ts`](../test/courses/courseAdminDetail.schema.test.ts) |

## Related docs

- [courseOfferings.md](./courseOfferings.md)
