# BuildGuard

Construction management SaaS. See [`docs/high-level-design.md`](docs/high-level-design.md)
for the architecture and [`docs/demo/index.html`](docs/demo/index.html) for the static
UX prototype that predates this codebase. The `docs/` folder is a separate Jekyll site
published via GitHub Pages and is unaffected by anything below.

## Applications

This is an npm-workspaces monorepo:

- `apps/api` — NestJS backend (modular monolith), one deployable serving both frontends.
- `apps/monitor` — customer-facing web app (Owner/Project Manager/Contractor/Inspector/Viewer):
  project dashboard, documents, AI Vision Inspector findings review, team/role management,
  tenders/bidding/contracts, contractor reviews and Trust Score, a project Q&A chat, and a CAD/plan
  viewer with layers and measurements.
- `apps/admin` — internal ops console for BuildGuard staff: contractor verification queue,
  clients/projects/users directories, audit log, tenders/contracts oversight, review disputes.
  Separate login realm from `monitor` (distinct JWT audience), same backend.
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
- **Tenders & Contractors (M8) ships with several deliberately scoped-down pieces**, each behind
  a documented seam so it can be upgraded without a rewrite:
  - **No real geo matching.** `Project`/`ContractorProfile` carry no lat/long and there's no
    PostGIS extension configured. The design doc's `geo_proximity_decay` term is a constant
    placeholder (`GeoScoringProvider` in `apps/api/src/modules/tenders/matching/`) until real
    location data + PostGIS are added.
  - **Trust Score is real as of M9** (see below) — `TrustScoreProvider` now delegates to it via
    `ComputedTrustScoreProvider`.
  - **No availability calendar.** A contractor sets a single `currentlyAvailable` boolean on
    their profile; the formula's `availability_fit(timeline)` term reads only that flag.
  - **No escrow/Stripe payment execution.** `Contract.paymentMilestones` is a data structure
    only (one milestone per project phase, proportioned by planned budget) — releasing a
    milestone's funds is the Payments module's job (phase 4); no money moves as part of M8.
- **Trust Score (M9) is computed on read, not persisted, and three of its six weighted
  components are stubbed** — see `schema.prisma`'s Trust Score section header for the full
  reasoning:
  - **Real components:** disputes (approximated as the rate of ≤2-star published reviews — no
    owner-initiated "performance complaint" entity exists, only the review-appeal `Dispute`
    below), service (blend of review sentiment + tender-invitation response speed), tenure &
    experience (signed-contract count + account age).
  - **Stubbed components** (`schedule_adherence`, `execution_quality`, `financial_transparency`):
    constant placeholders behind seams in `apps/api/src/modules/trust/scoring/` — Defect and
    Invoice aren't attributable to a specific contractor in this schema yet, so there's no real
    per-contractor signal to compute them from.
  - **Narrower fraud barrier than the design doc's ideal.** A review requires a real signed
    `Contract` between the reviewer's project and the contractor; the design doc's stricter
    "AND completed a verified milestone" isn't enforceable because `Milestone` is tied to a
    `Phase`, not a specific Contract/contractor.
  - **Dispute resolution works, but only for reviews** — a contractor can appeal a review they
    believe is unfair (`POST /reviews/:reviewId/disputes`), and staff resolve it from the admin
    console's Disputes page. There is no owner-initiated dispute against contractor performance,
    and anomaly-detection fraud defense (device/IP graphs, rating-distribution analysis) is
    fully deferred — no usage data exists yet to detect anomalies in.
- **RAG Assistant (M10) is UI + plumbing only — the retrieval/LLM pipeline is a hardcoded stand-in.**
  `MockRagService` (`apps/api/src/modules/rag/mock-rag.service.ts`) answers via keyword matching
  against real project data (Finance, Milestone, Detection queries) — not semantic retrieval or an
  LLM. This keeps the "numbers come from the API, not the LLM" principle honest even in mock form.
  `RagService` is the swap-in seam for a real hybrid-retrieval + LLM pipeline; nothing else in the
  module (schema, controller, frontend) needs to change when that lands.
- **CAD/Plan Viewer (M10) is UI + plumbing only — there is no real DWG/DXF conversion.**
  `MockCadDataService` (`apps/api/src/modules/cad/mock-cad-data.service.ts`) returns a
  hand-authored inline demo floor plan (fixed layers, fixed scale) regardless of which document is
  requested — it never reads the uploaded file. `CadDataProvider` is the swap-in seam for a real
  conversion pipeline. `Measurement` (length/area, via the shoelace formula) is fully real and
  persisted — only the drawing data it measures against is canned.
- **No Marketplace.** Still phase 4 per the roadmap.
