# Users (`src/users/`)

## Overview

Lightweight **`User`** introspection endpoints for authenticated clients (distinct from **`/admin/users/...`** management routes).

## File layout

| File | Responsibility |
|------|----------------|
| [`userRouter.ts`](../src/users/userRouter.ts) | Routing |
| [`userController.ts`](../src/users/userController.ts) | **`GET /me` handler** pulling Prisma **`User`** by JWT id |

(No dedicated **`*.schema.ts` yet—add when POST/PUT user profile editing arrives.)

## How it fits

Mounted at **`/users`** underneath global JWT auth (**[middleware](./middleware.md)**).


## API surface (`/users`)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/users/me` | Returns current user envelope (**controller defines fields**) |

## Development guidelines

Adding fields:

1. Decide if data is safe for student self-fetch vs admin-only (**split admin controller if sensitive**).
2. Introduce Zod **`users.schema.ts`** when accepting query params or PATCH bodies.
3. Consider caching posture (normally avoid—responses should remain DB-authoritative).


## Authorization

JWT presence enforced globally; **`getMe`** should **never** expose foreign users (**only `req.user!.userId` scope**).


## Testing

| File |
|------|
| [`test/users/userRouter.http.test.ts`](../test/users/userRouter.http.test.ts) |


## Related docs

- [auth.md](./auth.md)
- [middleware.md](./middleware.md)
