# BuildGuard

Construction management SaaS. See [`docs/high-level-design.md`](docs/high-level-design.md)
for the architecture and [`docs/demo/index.html`](docs/demo/index.html) for the static
UX prototype. The `docs/` folder is a separate Jekyll site published via GitHub Pages
and is unaffected by anything below.

## Applications

This is an npm-workspaces monorepo:

- `apps/api` — NestJS backend (modular monolith), one deployable serving both frontends.
- `apps/monitor` — customer-facing web app (Owner/PM/Contractor/Inspector/Viewer).
- `apps/admin` — internal ops console for BuildGuard staff (client/contractor/user
  management, contractor verification, audit log). Separate login realm from `monitor`,
  same backend.
- `packages/shared-types` — TS types/enums shared between the API and both frontends.
- `packages/api-client` — typed fetch client + TanStack Query wiring, used by both frontends.

## Local development

Prerequisites: Node 20+, Docker (for Postgres/MinIO once M1+ lands).

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/monitor/.env.example apps/monitor/.env
cp apps/admin/.env.example apps/admin/.env

npm run dev:api        # http://localhost:3000/api/v1/health
npm run dev:monitor    # http://localhost:5173
npm run dev:admin      # http://localhost:5174
```

`npm run build`, `npm run lint`, `npm run typecheck`, and `npm test` all run across every
workspace.

Full docker-compose (Postgres + MinIO + migrations + seed data + both frontends) lands in
M7 of the build plan.
