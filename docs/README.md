# Developer documentation index

This directory holds **module guides** aligned with folders under [`src/`](../src/): purpose, responsibilities, patterns, routes, testing, and how to extend safely.

Operational setup—environment variables, Docker Compose, data volumes, deployment flags—is in the repository root **[`README.md`](../README.md)**. Use that for day-one setup; use these docs for **how code is structured** and **where to edit**.

---

## Repository shape

Here is where the pieces of **`project-showcase-backend`** live, and how they relate at a glance.

### What sits at the repo root (besides source)

| Area | Typical paths | Role |
|------|----------------|------|
| **Application** | [`src/`](../src/) | Express API: feature folders, middleware, schemas, singleton clients |
| **Data model & migrations** | [`prisma/`](../prisma/) (`schema.prisma`, `migrations/`, [`seed.ts`](../prisma/seed.ts)) | Database contracts and repeatable schema changes |
| **Tests** | [`test/`](../test/), [`vitest.config.ts`](../vitest.config.ts) | Vitest suites (structure mirrors [`src/`](../src/) domains; shared [`setup.ts`](../test/setup.ts) and [`helpers/`](../test/helpers/)) |
| **Module docs** | This folder ([`docs/`](./)) | Markdown guides keyed to [`src/`](../src/) domains |
| **CI/CD** | [`.github/workflows/`](../.github/workflows/) | Build, test, and deploy pipelines |
| **Container build** | [`Dockerfile`](../Dockerfile), [`legacy-docker-compose.yaml`](../legacy-docker-compose.yaml) | Backend image / legacy Compose reference |
| **Examples for student projects** | [`templates/`](../templates/) | Sample Docker Compose / Dockerfiles referenced from ops docs |

Root config/tooling shared by scripts and editors includes **`package.json`**, **`tsconfig*.json`**, ESLint/Prettier, and **`package-lock.json`**.

See **[`core.md`](./core.md)** for how [`server.ts`](../src/server.ts), [`app.ts`](../src/app.ts), and singleton files at the **`src/`** root fit together.

### Directory map (what lives next to what)

Boxes are logical groupings—not every file name is listed. Feature names match folders under **`src/`** and mirrored areas under **`test/`**.

```mermaid
flowchart TB
  subgraph repoRoot [project-showcase-backend repo]
    direction TB

    subgraph toolingDelivery [Tooling CI and deployment artifacts]
      direction TB
      pkgScripts["package.json · package-lock · tsconfig *.json Vitest ESLint Prettier configs"]
      ghaCi[".github/workflows ci.yml deploy-staging.yml deploy-production.yml"]
      dockerArtifacts["Dockerfile · legacy-docker-compose.yaml"]
      studentTemplates["templates example Docker Compose and Dockerfile SQL"]
    end

    subgraph srcTree [src application code]
      direction TB
      bootClients["Bootstrap and shared clients<br/>server.ts · app.ts · prisma.ts docker.ts firebase.ts git.ts"]
      subgraph featureDirs [Feature modules routers controllers services schemas]
        feAuth["auth · users"]
        feCatalog["courses · semesters"]
        feOffering["courseOfferings enrollment teams spark"]
        feProjects["projects oldProjects"]
        feAdmin["admin"]
      end
      subgraph infraDirs [Cross cutting inside src]
        mw["middleware"]
        guards["authorization"]
        helpers["utils · schemas · types · constants · config"]
      end
    end

    subgraph prismaTree [prisma]
      direction LR
      pSchema["schema.prisma"]
      pMigrations["migrations"]
      pSeed["seed.ts"]
    end

    subgraph testTree [test]
      direction TB
      twSetup["Vitest wiring setup.ts helpers"]
      twSuites["Package dirs aligned with src e.g. admin auth authorization<br/>courseOfferings courses enrollment projects teams spark …<br/>plus top level app docker git integration tests"]
    end

    subgraph docTree [docs]
      docsIndex["README.md developer index"]
      docsPages["Markdown guides aligned with src modules"]
    end
  end

  featureDirs -.-> prismaTree
  feProjects -.-> bootClients
  feOffering -.-> bootClients
  feAuth -.-> bootClients
  infraDirs -.->|"imported by"| featureDirs
  twSuites -.->|"mirrors"| featureDirs
```

**How to read the dashed arrows**

- **Cross-cutting `src/` layers → features** — `middleware`, `authorization`, and **`utils` / `schemas` / `types` / `constants` / `config`** are imported by routers and controllers; most are not their own HTTP subtrees (**`/auth`** is the notable public subtree from **`auth`**).

- **Feature modules → `prisma/`** — domain code persists via **Prisma** using models in [`schema.prisma`](../prisma/schema.prisma).

- **Feature modules → bootstrap clients (`prisma.ts`, `docker.ts`, `firebase.ts`, `git.ts`)** — **`auth`** uses Firebase, **`projects`** uses Docker plus Git clones, and most DB access goes through **`prisma`** (see **`core`** for specifics).

- **`test/` → mirrors `src/`** — a [`test/`](../test/) package directory usually exercises the matching **`src/`** module (HTTP tests compose [`createApp()`](../src/app.ts) from **`app.ts`**, not **`server.ts`**).

### Runtime layering (single process)

When **`npm run dev`** / **`npm start`** runs [`server.ts`](../src/server.ts), one Node process wires HTTP handling, cron-style background checks, and external integration clients like this:

```mermaid
flowchart TB
  subgraph nodeProcess [Node process]
    subgraph startup [Startup sequence]
      SRV["server.ts"]
      ENV["dotenv · loadEnv parsed env schema"]
      FBINIT["Firebase Admin init skipped when NODE_ENV is test"]
      SRV --> ENV
      SRV --> FBINIT
    end

    subgraph httpStack [Express HTTP stack from createApp]
      APPNODE["app.ts createApp"]
      MID["middleware logger helmet JSON body cookies"]
      HEALTH["GET /health Prisma raw query ping"]
      PUB["public subtree /auth routes"]
      PROTECT["requireAuth · userRateLimiter · mounted domain routers"]
      ERR["globalErrorHandler"]
      SRV --> APPNODE
      APPNODE --> MID
      MID --> HEALTH
      MID --> PUB
      MID --> PROTECT
      APPNODE --> ERR
    end

    subgraph handlersLayer [Controllers and services behind routers]
      CTRL["Feature controllers"]
      SVCS["Prisma accesses dockerode simple-git Spark HTTPS etc."]
      CTRL --> SVCS
    end

    subgraph externalProcesses [Depends on outside this repo]
      DB_SIDE["Database at DATABASE_URL"]
      DOCKER_SIDE["Docker daemon often socket mounted from host"]
    end

    subgraph backgroundCron [Cron started from server lifecycle]
      CRONJOBS["containerMonitor and project pruning tasks"]
      SRV --> CRONJOBS
    end

    PROTECT --> CTRL
    SVCS --> DB_SIDE
    SVCS --> DOCKER_SIDE
    HEALTH --> DB_SIDE
    CRONJOBS --> DB_SIDE
    CRONJOBS --> DOCKER_SIDE
  end
```

**Background jobs:** [`containerMonitor`](../src/projects/containerMonitor.ts) (and related pruner helpers in the same area) reconcile **database `Project` state** with **live containers**—see **`projects`** and **`core`** docs for shutdown behavior.

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
