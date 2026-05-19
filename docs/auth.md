# Auth (`src/auth/`)

## Overview

**Public** endpoints that bootstrap sessions: validates **Firebase ID tokens**, issues **JWT access tokens**, and refreshes access via **HTTP-only cookie** handshake.

Mounted **before** `requireAuth` in [`app.ts`](../src/app.ts), so routers here must **avoid** trusting `req.user` until JWT verification completes.

## File layout

| File | Responsibility |
|------|----------------|
| [`authRouter.ts`](../src/auth/authRouter.ts) | Route registration |
| [`authController.ts`](../src/auth/authController.ts) | **`verifyFirebaseToken`**, **`refreshAccessToken`** |
| [`auth.schema.ts`](../src/auth/auth.schema.ts) | Validates inbound Firebase payloads |

## How it fits

- Uses [`firebase.ts`](../src/firebase.ts) Admin SDK (**initialized in `server.ts`**, skipped in **`NODE_ENV === 'test'`** unless tests stub).
- Persists/syncs **`User`** rows via **Prisma** on first login.
- Signs JWT payloads shaped as **`AuthJwtPayload`** (**[types](./types.md)**).

## API surface (`/auth`)

| Method | Path | Body / cookies | Responses |
|--------|------|----------------|-----------|
| `POST` | `/auth/verify-token` | **`{ firebaseToken }`** (**Zod**) | JSON access token + **`Set-Cookie`** refresh contract (**see controller**) |
| `POST` | `/auth/refresh-token` | Refresh cookie | Rotates JWT access credential |

Consult [`authController.ts`](../src/auth/authController.ts) for TTLs, cookie names (**HttpOnly**, **Secure** flags in prod assumptions), error mapping.

## Development guide

1. Add schemas to [`auth.schema.ts`](../src/auth/auth.schema.ts) if widening accepted client payloads (**never** blindly trust arbitrary fields).
2. Register new **public-only** endpoints on **`authRouter`** ensuring they remain **above** **`router.use(requireAuth)`**.
3. If adjusting JWT signing, synchronize:

   - [`middleware/authentication.ts`](../src/middleware/authentication.ts) verification branches
   - [`types/express`](../src/types/express/index.d.ts) payload typing
   - Client expectations (coordinate with frontend independently)

Prefer moving secret handling exclusively through **`ACCESS_TOKEN_SECRET`** (**[config](./config.md)**).

## Authorization

Beyond login, **`requireAuth`** asserts membership; admin-only paths add **`requireAdmin`**.

Refresh tokens should remain **tamper-evident** and **scoped** (**controller** specifics).

## Testing

| File |
|------|
| [`test/auth/auth.schema.test.ts`](../test/auth/auth.schema.test.ts) |
| [`test/middleware/authentication.test.ts`](../test/middleware/authentication.test.ts) (**JWT layering**) |

## Related docs

- [middleware.md](./middleware.md)
- [config.md](./config.md)
- [core.md](./core.md)
