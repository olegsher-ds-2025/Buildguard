#!/usr/bin/env bash
# Builds images for the target host's architecture (arm64 on the Pi, amd64 on the x86 box that took over 10.0.0.100),
# ships them over SSH and (re)starts the stack there. Nothing is compiled on the target. Safe to re-run: it updates images and restarts only what changed.
#
#   infra/deploy-pi.sh                 # build + ship + up
#   PI_HOST=10.0.0.100 infra/deploy-pi.sh
#   SKIP_BUILD=1 infra/deploy-pi.sh    # ship and restart the images already built locally
#   ONLY=landing infra/deploy-pi.sh    # build, ship and restart just the landing page
set -euo pipefail

PI_HOST="${PI_HOST:-10.0.0.100}"
PI_USER="${PI_USER:-oleg}"
PI_DIR="${PI_DIR:-/home/${PI_USER}/projects/buildguard}"
SSH="ssh -o BatchMode=yes ${PI_USER}@${PI_HOST}"
# Public HTTPS names fronted by Nginx Proxy Manager: PUBLIC_URL -> :8110 (and /api/ -> :8112), FILES_URL -> :8113.
PUBLIC_URL="${PUBLIC_URL:-https://buildguard.sher.biz}"
FILES_URL="${FILES_URL:-https://bg-files.sher.biz}"
API_URL="${PUBLIC_URL}/api/v1"
# Landing page hostname -> :8114. Its origin is what the API accepts on the public lead forms.
LANDING_URL="${LANDING_URL:-https://yesod.sher.biz}"
BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
ONLY="${ONLY:-}"
cd "$(dirname "$0")/.."

case "$(${SSH} uname -m)" in
  x86_64) PLATFORM=linux/amd64 ;;
  *) PLATFORM=linux/arm64 ;;
esac

build() { # name dockerfile [build-args...]
  local name="$1" file="$2"; shift 2
  echo ">> building ${name} (${PLATFORM}; arm64 on an x86 machine is emulated and slow)"
  docker buildx build --platform "${PLATFORM}" --load -f "${file}" -t "${name}:pi" "$@" .
}

if [[ -z "${SKIP_BUILD:-}" ]]; then
  if [[ -z "${ONLY}" ]]; then
    build buildguard-api infra/docker/api.Dockerfile
    build buildguard-monitor infra/docker/web.Dockerfile --build-arg APP_NAME=monitor --build-arg "VITE_API_BASE_URL=${API_URL}"
    build buildguard-admin infra/docker/web.Dockerfile --build-arg APP_NAME=admin --build-arg "VITE_API_BASE_URL=${API_URL}"
  fi
  if [[ -z "${ONLY}" || "${ONLY}" == landing ]]; then
    build buildguard-landing infra/docker/landing.Dockerfile --build-arg "BUILD_SHA=${BUILD_SHA}"
  fi
fi

if [[ "${ONLY}" == landing ]]; then
  IMAGES=(buildguard-landing:pi)
else
  IMAGES=(buildguard-api:pi buildguard-monitor:pi buildguard-admin:pi buildguard-landing:pi)
fi

echo ">> shipping images to ${PI_HOST}"
${SSH} "mkdir -p '${PI_DIR}'"
docker save "${IMAGES[@]}" | gzip | ${SSH} 'gunzip | docker load'
scp -q infra/docker-compose.pi.yml "${PI_USER}@${PI_HOST}:${PI_DIR}/docker-compose.yml"
scp -q infra/create-bucket.js "${PI_USER}@${PI_HOST}:${PI_DIR}/create-bucket.js"

# First deploy only: generate secrets on the Pi so they never leave it or enter the repo.
${SSH} "cd '${PI_DIR}' && if [ ! -f .env ]; then
  umask 177
  {
    echo POSTGRES_PASSWORD=\$(openssl rand -hex 24)
    echo JWT_ACCESS_SECRET=\$(openssl rand -hex 32)
    echo JWT_REFRESH_SECRET=\$(openssl rand -hex 32)
    echo MINIO_ROOT_USER=buildguard
    echo MINIO_ROOT_PASSWORD=\$(openssl rand -hex 24)
  } > .env
  echo 'generated .env'
fi
sed -i '/^S3_PUBLIC_ENDPOINT=/d;/^CORS_ORIGINS=/d;/^LEADS_ALLOWED_ORIGINS=/d' .env
echo S3_PUBLIC_ENDPOINT=${FILES_URL} >> .env
echo CORS_ORIGINS=${PUBLIC_URL},http://${PI_HOST}:8110,http://${PI_HOST}:8111 >> .env
echo LEADS_ALLOWED_ORIGINS=${LANDING_URL},http://${PI_HOST}:8114 >> .env"

echo ">> starting the stack"
if [[ "${ONLY}" == landing ]]; then
  ${SSH} "cd '${PI_DIR}' && docker compose up -d landing && docker compose ps landing"
else
  ${SSH} "cd '${PI_DIR}' && docker compose up -d --remove-orphans && docker compose ps"
fi
echo
echo "monitor: ${PUBLIC_URL}   admin: http://${PI_HOST}:8111   api: ${API_URL}/health   landing: ${LANDING_URL}"
