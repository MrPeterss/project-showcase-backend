# Middleware (`src/middleware/`)

## Overview

Cross-cutting HTTP behavior lives here: structured logging, **JWT authentication**, optional **admin** gates, **per-user rate limiting**, **Zod-backed request validation**, and a **central JSON error formatter**.

## File layout

| File | Responsibility |
|------|----------------|
| [`logger.ts`](../src/middleware/logger.ts) | Request/response timing logs |
| [`authentication.ts`](../src/middleware/authentication.ts) | `requireAuth` (Bearer JWT), `requireAdmin` |
| [`rateLimit.ts`](../src/middleware/rateLimit.ts) | `userRateLimiter` keyed by JWT `userId` |
| [`validateRequest.ts`](../src/middleware/validateRequest.ts) | Parse `params`/`query`/`body` → `req.validated` |
| [`errorHandler.ts`](../src/middleware/errorHandler.ts) | Maps `AppError` (and unknown errors) to JSON responses |

Global stack order from [`createApp()`](../src/app.ts) is summarized in **[core.md](./core.md)**.

## How it fits

- [`requireAuth`](../src/middleware/authentication.ts) runs **after** public `/health` and `/auth`; all feature routers mounted below it assume `req.user` is present for authenticated callers.
- [`userRateLimiter`](../src/middleware/rateLimit.ts) runs **after** `requireAuth` so it can identify users from the JWT (`userId`; admins are typically exempt).

## JWT contract (`requireAuth`)

- Expects **`Authorization: Bearer <accessToken>`**
- Validates with [**`ACCESS_TOKEN_SECRET`**](./config.md) (`jsonwebtoken`)
- Sets **`req.user`**: **`{ userId, isAdmin }`** (see **[types](./types.md)**)

`requireAdmin` checks **`req.user.isAdmin === true`** and returns **`403`** otherwise.

## `validateRequest(schema)`

Composable Express middleware generator: given a **Zod** object `{ params?, query?, body? }`, it parses **`req`** slices and attaches **`req.validated`**. Missing sections are skipped when not present in the schema.

Controllers should read coerced **`req.validated.params`** (often numeric IDs thanks to **`paramCoercions`**) rather than parsing raw strings by hand.

## Error handling (`globalErrorHandler`)

Subclasses of [`AppError`](../src/utils/AppError.ts) carry HTTP status codes and optional error codes stable for API clients.

## Development guide

### Add global middleware

1. Implement or import middleware factory in [`middleware/`](../src/middleware/).
2. Register in [`app.ts`](../src/app.ts) **before** routers (or selectively on routers). Keep auth ordering: logging → safety headers → parsers → routing.

### Protect a route subtree with admin-only

Prefer mount-level protection (see [`courseRouter.ts`](../src/courses/courseRouter.ts) wrapping every handler with **`requireAdmin`**) **or** `app.ts` subtree:

```typescript
router.use('/admin', requireAdmin, adminRouter);
```

### Add validated parameters to a handler

1. Extend Zod schema in the domain **`*.schema.ts`**.
2. Add **`validateRequest(yourSchema)`** before controller.
3. In controller use **`req.validated!.params!`** typing via domain-specific assertions or narrowing.

### Add a non-JWT-public route

Register **above** **`router.use(requireAuth)`** in [`app.ts`](../src/app.ts) (inside the inner `express.Router`). Auth routes demonstrate this pattern.

## Authorization references

Higher-level assertions live in **`authorization/`** and **`authorizationHelpers`**; see **[authorization.md](./authorization.md)** (and **[courseOfferings](./courseOfferings.md)** / **[teams](./teams.md)** for how routes use them).

## Testing

| File | Covers |
|------|--------|
| [`test/middleware/authentication.test.ts`](../test/middleware/authentication.test.ts) | Bearer parsing, payloads |
| [`test/middleware/errorHandler.test.ts`](../test/middleware/errorHandler.test.ts) | `AppError` mapping |
| [`test/middleware/rateLimit.test.ts`](../test/middleware/rateLimit.test.ts) | Limiter buckets |
| [`test/middleware/validateRequest.test.ts`](../test/middleware/validateRequest.test.ts) | Zod piping into `req` |

Vitest initializes env in **[`test/setup.ts`](../test/setup.ts)** (sets `ACCESS_TOKEN_SECRET`, `DATABASE_URL`, `NODE_ENV`).

## Related docs

- [authorization.md](./authorization.md)
- [core.md](./core.md)
- [config.md](./config.md)
- [schemas.md](./schemas.md)
- [utils.md](./utils.md)
