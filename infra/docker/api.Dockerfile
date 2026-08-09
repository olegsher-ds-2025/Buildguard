# syntax=docker/dockerfile:1
#
# Build context is the repo root (see infra/docker-compose.yml's `context:
# ..`), because npm workspaces need every workspace's package.json present
# for `npm ci` to resolve consistently against the root lockfile — even
# though this image only runs apps/api.

FROM node:20-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/monitor/package.json apps/monitor/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
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
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/apps/api apps/api
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
