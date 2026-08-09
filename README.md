# BuildGuard

Construction management SaaS. See [`docs/high-level-design.md`](docs/high-level-design.md)
for the architecture and [`docs/demo/index.html`](docs/demo/index.html) for the static
UX prototype that predates this codebase. The `docs/` folder is a separate Jekyll site
published via GitHub Pages and is unaffected by anything below.

## Applications

This is an npm-workspaces monorepo:

- `apps/api` — NestJS backend (modular monolith), one deployable serving both frontends.
- `apps/monitor` — customer-facing web app (Owner/Project Manager/Contractor/Inspector/Viewer):
  project dashboard, documents, AI Vision Inspector findings review, team/role management.
- `apps/admin` — internal ops console for BuildGuard staff: contractor verification queue,
  clients/projects/users directories, audit log. Separate login realm from `monitor` (distinct
  JWT audience), same backend.
- `packages/shared-types` — TS types/enums shared between the API and both frontends.
- `packages/api-client` — typed fetch client + TanStack Query wiring, used by both frontends.
- `infra/` — `docker-compose.yml` and the Dockerfiles it builds.

## Quick start — Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

Brings up Postgres, MinIO (S3-compatible storage, with the bucket and CORS pre-configured),
runs migrations + seeds the database, then starts the API and both frontends:

- Monitor: http://localhost:5173
- Admin: http://localhost:5174
- API: http://localhost:3000/api/v1/health
- MinIO console: http://localhost:9001 (`buildguard` / `buildguard123`)

Seeded accounts (see [`apps/api/prisma/seed.ts`](apps/api/prisma/seed.ts) for the full
"Villa Sharon" fixture — phases, budget, findings, contractors in mixed verification states):

| Role | Email | Password |
|---|---|---|
| Owner (Monitor) | `owner@buildguard.dev` | `owner-password-123` |
| Staff (Admin) | `staff@buildguard.dev` | `staff-password-123` |
| Contractor (Monitor) | `amir@amir-cohen-construction.example` | `contractor-password-123` |

## Local development without Docker

Prerequisites: Node 20+, a local PostgreSQL 16 instance, and an S3-compatible endpoint for
the Documents/Findings upload flows (MinIO, or [`s3rver`](https://www.npmjs.com/package/s3rver)
for a pure-Node alternative with no separate binary — this is what was used to develop and
verify the storage-first upload flow in this environment, where MinIO's binary download was
blocked).

```bash
npm install
cp apps/api/.env.example apps/api/.env        # edit DATABASE_URL / S3_* for your local setup
cp apps/monitor/.env.example apps/monitor/.env
cp apps/admin/.env.example apps/admin/.env

npm run build:packages                                   # packages/* must build before apps/* consume them
npm run prisma:deploy --workspace=@buildguard/api        # apps/api/prisma migrate deploy
npm run seed --workspace=@buildguard/api                 # apps/api/prisma db seed

npm run dev:api        # http://localhost:3000/api/v1/health
npm run dev:monitor    # http://localhost:5173
npm run dev:admin      # http://localhost:5174
```

If your S3-compatible server enforces CORS (real MinIO does, `s3rver` needs it configured
explicitly), allow `http://localhost:5173` and `http://localhost:5174` for `PUT`/`GET` —
otherwise the browser-driven upload flows in Documents and Findings fail with a "Failed to
fetch" that never reaches the network (curl-based testing won't catch this; only a real
browser enforces CORS).

## Testing

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` — run across every
  workspace. `npm test` runs `apps/api`'s unit tests (mocked Prisma/services).
- `npm run test:e2e --workspace=@buildguard/api` — real HTTP requests against a real
  Postgres database (`apps/api/test/app.e2e-spec.ts`). Migrates + seeds
  `DATABASE_URL` before running, so point it at a disposable database, not your main dev one.
  CI runs this against a `postgres:16` service container (see `.github/workflows/ci.yml`).

## Known simplifications (phase 1)

Deliberate scope cuts, tracked here rather than silently dropped:

- **No self-serve signup, invite emails, or password reset.** Accounts are created via the
  seed script. Inviting a team member in Monitor requires them to already have an account —
  inviting an unregistered email fails clearly (404) rather than doing nothing.
- **No refresh-token rotation.** A single 12h access token, no silent renewal.
- **No Postgres row-level security.** The design doc calls RLS a "second safety net" over
  app-layer authorization (§8) — `ProjectRoleGuard` and `StaffOnlyGuard` are the primary,
  mandatory enforcement (every project-scoped and staff-only route is verified to 401/403/404
  correctly without RLS, both in `test/app.e2e-spec.ts` and via manual testing throughout
  development). RLS was considered for this milestone and deliberately deferred again: it
  requires per-transaction Postgres session variables that Prisma doesn't support natively,
  real plumbing for a defense-in-depth layer over controls that are already fully enforced.
  Revisit if a second, less-trusted DB-access path (e.g. a read replica queried directly by an
  analytics tool) is ever added — that's the scenario RLS actually protects against that the
  app-layer guards can't.
- **No CPM/critical-path scheduling, no cash-flow forecast, no CAD/DWG viewer.** PDF documents
  only. All explicitly phase 3+ per the design doc's roadmap.
- **No real AI model.** `AiVisionService` (`apps/api/src/modules/ai-vision/ai-vision.interface.ts`)
  is the integration seam; `MockAiVisionService` is a clearly-labeled placeholder. Swapping in
  a real Vision Inspector is a one-line provider change.
- **No Tenders/matching, Trust Score computation, Payments/Escrow, Marketplace, RAG.** Phase
  2–4 per the roadmap.
