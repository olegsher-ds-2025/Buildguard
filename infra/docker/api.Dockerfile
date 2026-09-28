# syntax=docker/dockerfile:1
#
# Build context is the repo root (see infra/docker-compose.yml's `context:
# ..`), because npm workspaces need every workspace's package.json present
# for `npm ci` to resolve consistently against the root lockfile — even
# though this image only runs apps/api.

FROM node:20-slim AS deps
WORKDIR /repo
# node:20-slim (Debian) ships no OpenSSL at all — Prisma's engine binaries
# are dynamically linked against libssl and silently mis-detect/default
# without it (a warning at generate time, a hard failure at engine
# invocation time). Needed here so postinstall's `prisma generate` (during
# `npm ci` below) correctly detects OpenSSL 3.x and fetches the matching
# engine, and again in the `runtime` stage below since that's a separate,
# equally bare `node:20-slim`.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/monitor/package.json apps/monitor/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
# apps/api's postinstall runs `prisma generate`, which needs the schema
# present during `npm ci` itself, not just later in the `build` stage.
COPY apps/api/prisma apps/api/prisma
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN npm run build --workspace=@buildguard/shared-types --workspace=@buildguard/api-client
RUN npm run build --workspace=@buildguard/api
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

FROM node:20-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/apps/api apps/api
# apps/api/tsconfig.json extends this (relative path), needed by the
# `migrate` service's seed step (ts-node, not the compiled dist/main.js).
COPY --from=build /repo/tsconfig.base.json tsconfig.base.json
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
