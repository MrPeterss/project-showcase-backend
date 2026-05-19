# Developer documentation index

This directory holds **module guides** aligned with folders under [`src/`](../src/): purpose, responsibilities, patterns, routes, testing, and how to extend safely.

Operational setup—environment variables, Docker Compose, data volumes, deployment flags—is in the repository root **[`README.md`](../README.md)**. Use that for day-one setup; use these docs for **how code is structured** and **where to edit**.

---

## Repository shape

```mermaid
flowchart TB
  subgraph http [HTTP]
    createApp["createApp in app.ts"]
  end
  subgraph routes [Domain routers]
    authR["auth"]
    adminR["admin"]
    domainR["courses, courseOfferings, teams, projects, …"]
  end
  subgraph services [Services and data]
    prisma["prisma.ts"]
    docker["docker.ts"]
    firebase["firebase.ts"]
  end

  createApp --> authR
  createApp --> domainR
  authR --> firebase
  domainR --> prisma
  domainR --> docker
```

- **Bootstrap:** [`server.ts`](../src/server.ts) validates env (`loadEnv`), initializes Firebase (non-test), creates the Express app, listens on `PORT`, connects Prisma, and starts background jobs (container monitor / pruner).
- **App factory:** [`app.ts`](../src/app.ts) exports `createApp()` so Vitest/supertest can run the HTTP stack **without binding a network port**.
- **Data and integrations:** Prisma (`prisma.ts`), Dockerode (`docker.ts`), Firebase Admin (`firebase.ts`), and `simple-git` (`git.ts`) back domain modules.

See **[`core.md`](./core.md)** for details on root-level `src` files.

---

## Request lifecycle

1. **Middleware (global):** [`requestLogger`](../src/middleware/logger.ts) → Helmet → JSON body (`1mb`) → cookie parser  
2. **Public routes:** `GET /health`, `router.use('/auth', authRouter)`  
3. **Authenticated stack:** [`requireAuth`](../src/middleware/authentication.ts) (Bearer JWT) → [`userRateLimiter`](../src/middleware/rateLimit.ts)  
4. **Domain routers:** [`/admin`](../src/admin/adminRouter.ts) additionally uses [`requireAdmin`](../src/middleware/authentication.ts) at mount time  
5. **Errors:** [`globalErrorHandler`](../src/middleware/errorHandler.ts)

---

## Module documentation

| Topic | Doc | `src/` path |
|--------|-----|--------------|
| App bootstrap, DB, Docker, Firebase, Git | [core.md](./core.md) | `app.ts`, `server.ts`, `prisma.ts`, `docker.ts`, `firebase.ts`, `git.ts` |
| HTTP middleware stack | [middleware.md](./middleware.md) | [`middleware/`](../src/middleware/) |
| Env validation | [config.md](./config.md) | [`config/`](../src/config/) |
| Shared Zod route params | [schemas.md](./schemas.md) | [`schemas/`](../src/schemas/) |
| Roles and project statuses | [constants.md](./constants.md) | [`constants/`](../src/constants/) |
| Express `Request` augmentation | [types.md](./types.md) | [`types/`](../src/types/) |
| Errors + shared helpers | [utils.md](./utils.md) | [`utils/`](../src/utils/) |
| Offering / team guards | [authorization.md](./authorization.md) | [`authorization/`](../src/authorization/) |
| Firebase login → JWT | [auth.md](./auth.md) | [`auth/`](../src/auth/) |
| Current user profile | [users.md](./users.md) | [`users/`](../src/users/) |
| Catalog courses (admin CRUD) | [courses.md](./courses.md) | [`courses/`](../src/courses/) |
| Semesters | [semesters.md](./semesters.md) | [`semesters/`](../src/semesters/) |
| Course offerings (enrollment boundary) | [courseOfferings.md](./courseOfferings.md) | [`courseOfferings/`](../src/courseOfferings/) |
| Enrollments | [enrollment.md](./enrollment.md) | [`enrollment/`](../src/enrollment/) |
| Teams | [teams.md](./teams.md) | [`teams/`](../src/teams/) |
| Cornell Spark keys | [spark.md](./spark.md) | [`spark/`](../src/spark/) |
| Project deploy/containers | [projects.md](./projects.md) | [`projects/`](../src/projects/) |
| Legacy builders | [oldProjects.md](./oldProjects.md) | [`oldProjects/`](../src/oldProjects/) |
| Platform admin API | [admin.md](./admin.md) | [`admin/`](../src/admin/) |

---

## Common development commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode: `nodemon -x tsx src/server.ts` |
| `npm run build` | `tsc` compile to `dist/` |
| `npm start` | Production: `node dist/server.js` |
| `npm test` | Vitest (`test/setup.ts` loads env defaults) |
| `npm run lint` | ESLint on `src/` and `test/` |
| `npm run seed` | `tsx prisma/seed.ts` |

---

## Adding an HTTP endpoint (typical pattern)

```mermaid
flowchart LR
  schema["*.schema.ts + paramCoercions"] --> router["*Router + validateRequest"]
  router --> controller["*Controller + auth asserts"]
  controller --> service["*Service optional"]
  service --> data["prisma / docker / external"]
```

1. Extend or add **Zod** schema (often import [`paramCoercions`](../src/schemas/paramCoercions.ts) for ID params).
2. Register route on the **Router** with `validateRequest(schema)`.
3. Implement handler in **Controller** (`req.user`, `req.validated`).
4. Enforce **authorization** with guards in [`authorization/`](../src/authorization/) or [`authorizationHelpers`](../src/utils/authorizationHelpers.ts), or [`requireAdmin`](../src/middleware/authentication.ts).
5. Move non-trivial logic to **Service** modules.
6. Add **HTTP tests** under `test/` (see [`test/helpers/signTestJwt.ts`](../test/helpers/signTestJwt.ts), [`test/helpers/prismaMock.ts`](../test/helpers/prismaMock.ts)).

For enrollment-scoped URLs, start with **[`courseOfferings.md`](./courseOfferings.md)**, **[`enrollment.md`](./enrollment.md)**, **[`teams.md`](./teams.md)**, and **[`authorization.md`](./authorization.md)**.
