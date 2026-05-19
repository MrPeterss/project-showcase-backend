# Types (`src/types/`)

## Overview

TypeScript augmentation of Express **`Request`** to reflect runtime-injected authentication and validation fields.

## File layout

| File | Responsibility |
|------|----------------|
| [`express/index.d.ts`](../src/types/express/index.d.ts) | Global `declare global { namespace Express { interface Request … } }` |

## `AuthJwtPayload`

```typescript
interface AuthJwtPayload {
  userId: number;
  isAdmin: boolean;
}
```

Set by JWT middleware (**`requireAuth`**) whenever the bearer token parses.

## `ValidatedRequestParts`

```typescript
interface ValidatedRequestParts {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}
```

Populated via **`validateRequest`** after successful Zod parse.

## `req.file`

Multer file metadata typings for multipart routes (primarily **`projectRouter`** uploads).

## How it fits

Enable strongly typed `req.user!` / `req.validated!` usages in controllers without `as unknown` gymnastics.

Ensure the root **TypeScript** configuration (**`tsconfig.json`**) includes **`src/types`** so augmentation applies project-wide.

*(No standalone runtime tests—these are compile-time contracts.)*

## Related docs

- [middleware.md](./middleware.md)
- [schemas.md](./schemas.md)
