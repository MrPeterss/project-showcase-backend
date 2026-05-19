# Constants (`src/constants/`)

## Overview

String constants and complementary **Zod** schemas encode domain enumerations shared across multiple modules (**project lifecycle**, **`CourseOfferingEnrollment` roles**, system/admin flags) without scattering magic strings through Prisma queries.

## File layout

| File | Responsibility |
|------|----------------|
| [`projectStatus.ts`](../src/constants/projectStatus.ts) | Canonical **project statuses** (+ optional Zod schema export) |
| [`roles.ts`](../src/constants/roles.ts) | Course offering enrollment roles arrays + comparisons |

*(Exact exports evolve—consult the TS files.)*

## How it fits

- **`projects`** (deploy, monitors, tagging) compares Prisma **`Project.status`** against **`PROJECT_STATUS.*`**
- **`enrollment`** and **`authorizationHelpers`** reuse role arrays/constants for hierarchical checks (**student < TA < instructor**, etc.)

## Development guide

### Add a status or role kind

1. Append to the **`as const`** object **or** string union source of truth with a descriptive **`UPPER_SNAKE_CASE`** member.
2. Export a **`z.enum`** or helper array if validators need symmetry with HTTP payloads.
3. Update Prisma enums / migrations if the database itself must tighten values (constants alone do not migrate DB enums).

Prefer importing these constants everywhere (services, cron reconcilers, admin endpoints) rather than duplicated string literals.

## Testing

| File |
|------|
| [`test/constants/projectStatus.test.ts`](../test/constants/projectStatus.test.ts) |
| [`test/constants/roles.test.ts`](../test/constants/roles.test.ts) |

## Related docs

- [projects.md](./projects.md)
- [enrollment.md](./enrollment.md)
