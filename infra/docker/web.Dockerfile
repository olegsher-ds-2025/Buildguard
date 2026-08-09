# syntax=docker/dockerfile:1
#
# Shared by both frontends — build with `--build-arg APP_NAME=monitor` or
# `--build-arg APP_NAME=admin`. Build context is the repo root, same
# reasoning as api.Dockerfile.
#
# VITE_API_BASE_URL is baked in at build time (Vite inlines import.meta.env
# during `vite build`), not read at container start — rebuild the image to
# point a deployed frontend at a different API URL.

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
ARG APP_NAME
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/${APP_NAME} apps/${APP_NAME}
RUN npm run build --workspace=@buildguard/shared-types --workspace=@buildguard/api-client
RUN npm run build --workspace=@buildguard/${APP_NAME}

FROM node:20-slim AS runtime
ARG APP_NAME
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /repo/apps/${APP_NAME}/dist ./dist
EXPOSE 8080
# -s: serve index.html for unknown paths (client-side routing).
CMD ["serve", "-s", "dist", "-l", "8080"]
