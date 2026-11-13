#!/usr/bin/env bash
# Spry's core on Google Cloud (Lab 9). Infrastructure is gcp/ (Terraform);
# this ships code onto it and stops or starts the database.
#
#   scripts/deploy-gcp.sh api        build the API image, push it, roll Cloud Run
#   scripts/deploy-gcp.sh frontend   build the static site, deploy to Firebase Hosting
#   scripts/deploy-gcp.sh db-stop    stop Cloud SQL (storage still bills, ~$1.70/month)
#   scripts/deploy-gcp.sh db-start   start it again
#   scripts/deploy-gcp.sh status     what is running
#
# Credentials: your own Google account through gcloud (`gcloud auth login` and
# `gcloud auth application-default login`). No service account key.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF=(terraform -chdir="${ROOT}/gcp")

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

for tool in gcloud terraform; do
  command -v "${tool}" >/dev/null 2>&1 || die "${tool} is required but not installed"
done

[[ -d "${ROOT}/gcp/.terraform" ]] || "${TF[@]}" init -input=false >/dev/null
out() { "${TF[@]}" output -raw "$1"; }

PROJECT="$(gcloud config get-value project 2>/dev/null)"
REGION="us-central1"
DB="spry-db"

api() {
  command -v docker >/dev/null 2>&1 || die "docker is required"
  local repo tag image
  repo="$(out image_repository)" || die "apply gcp/ first: terraform -chdir=gcp apply"
  tag="$(git -C "${ROOT}" rev-parse --short HEAD)$(git -C "${ROOT}" diff --quiet || echo -dirty)"
  image="${repo}/api:${tag}"

  log "docker login to ${repo%%/*}"
  gcloud auth configure-docker "${repo%%/*}" --quiet >/dev/null

  # Cloud Run runs linux/amd64; a Mac builds arm64 unless told otherwise.
  # --target runtime: the same stage Docker Compose runs, no Lambda adapter.
  log "building ${image}"
  docker buildx build --platform linux/amd64 --target runtime \
    --tag "${image}" --push "${ROOT}/backend"

  # The image is part of the configuration, so a later plain `terraform
  # apply` keeps it instead of removing the service.
  printf '# Written by scripts/deploy-gcp.sh api.\napi_image = "%s"\n' "${image}" \
    > "${ROOT}/gcp/image.auto.tfvars"

  log "rolling Cloud Run (the entrypoint runs the migrations first)"
  "${TF[@]}" apply -input=false -auto-approve
  local url
  url="$(out api_url)"
  log "API at ${url}"
  curl -fsS "${url}/api/health/db" && echo
}

frontend() {
  command -v node >/dev/null 2>&1 || die "node is required"
  local app="${ROOT}/frontend" site pm
  site="$(out site_url)"

  # The Cognito ids come from .env (make infra-env); the API is this site's
  # own /api, which Firebase forwards to Cloud Run - one origin, no CORS.
  if [[ -f "${ROOT}/.env" ]]; then set -a; source "${ROOT}/.env"; set +a; fi
  [[ -n "${COGNITO_USER_POOL_ID:-}" && -n "${COGNITO_CLIENT_ID:-}" && -n "${COGNITO_DOMAIN:-}" ]] \
    || die "COGNITO_* are not set in .env - run make infra-env first"

  if command -v pnpm >/dev/null 2>&1; then pm=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then pm=(corepack pnpm)
  else pm=(npx --yes pnpm@10); fi

  log "building the static export against ${site}/api"
  (cd "${app}" && "${pm[@]}" install --frozen-lockfile)
  rm -rf "${app}/out"
  (cd "${app}" && NEXT_OUTPUT=export \
    NEXT_PUBLIC_API_URL="${site}" \
    NEXT_PUBLIC_PARSER_URL="${PARSER_URL:-}" \
    NEXT_PUBLIC_COGNITO_REGION="${COGNITO_REGION:-eu-north-1}" \
    NEXT_PUBLIC_COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID}" \
    NEXT_PUBLIC_COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID}" \
    NEXT_PUBLIC_COGNITO_DOMAIN="${COGNITO_DOMAIN}" \
    NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED="${COGNITO_GOOGLE_ENABLED:-false}" \
    "${pm[@]}" build)
  [[ -f "${app}/out/index.html" ]] || die "the export produced no out/index.html"

  log "deploying to Firebase Hosting"
  (cd "${app}" && npx --yes firebase-tools@latest deploy --only hosting --project "${PROJECT}" --non-interactive)
  log "site at ${site}"
}

db() {
  local policy="$1"
  log "Cloud SQL ${DB}: activation policy ${policy}"
  gcloud sql instances patch "${DB}" --activation-policy="${policy}" --quiet
}

status() {
  gcloud sql instances describe "${DB}" --format='value(name,settings.tier,state,settings.activationPolicy)'
  gcloud run services list --region "${REGION}" --format='table(metadata.name,status.url)'
}

case "${1:-}" in
  api) api ;;
  frontend) frontend ;;
  db-stop) db NEVER ;;
  db-start) db ALWAYS ;;
  status) status ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
