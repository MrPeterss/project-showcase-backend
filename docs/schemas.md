# Shared schemas (`src/schemas/`)

## Overview

Exports **named Zod building blocks**, especially **`positiveIntParam`** factories, so `:id`-style Express **string** parameters coerce to **`number`** primitives with predictable validation messaging.

Most domain routers import these builders into **`*.schema.ts`** files alongside richer body schemas.

## File layout

| File | Responsibility |
|------|----------------|
| [`paramCoercions.ts`](../src/schemas/paramCoercions.ts) | `positiveIntParam` helper + **`offeringIdParam`**, **`teamIdParam`**, **`courseIdParam`**, **`projectIdParam`**, … |

## Patterns

Instead of **`parseInt` inline** followed by **`if (NaN)`** checks, schemas declare:

```typescript
.params(z.object({
  offeringId: offeringIdParam,
}))
```

`validateRequest` then copies parsed objects into **`req.validated.params`**, already numeric.

### Extending conventions

Create new exports like **`assignmentIdParam = positiveIntParam('assignment ID')`** next to siblings for consistent error copy.

Avoid mixing raw string route params deep in controllers unless you intentionally delay coercion (prefer not).

## How it fits

Consumed by routers for **`teams`**, **`projects`**, **`courseOfferings`**, **`spark`**, **`enrollment`**, etc.

## Testing

| File |
|------|
| [`test/schemas/paramCoercions.test.ts`](../test/schemas/paramCoercions.test.ts) |

## Related docs

- [middleware.md](./middleware.md)
- Individual module docs (**teams**, **projects**, …) for assembled schemas.
