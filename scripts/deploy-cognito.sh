#!/usr/bin/env bash
# Create or update the Cognito user pool in infra/cognito.yaml and write its ids
# into .env, where deploy-frontend.sh (and deploy-backend.sh) read them.
#
# Needs COGNITO_DOMAIN_PREFIX in .env. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
# add "Continue with Google"; leave them blank for email + password only.
#
# Safe to re-run. Run it again after the first frontend deploy, so the site's
# callback URL is allowed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/cognito.yaml"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

if [[ -f "${ENV_FILE}" ]]; then
  preset="$(export -p)"
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
  eval "${preset}"
fi

for var in AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [[ -n "${!var:-}" ]] || unset "${var}"
done

PROJECT_NAME="${PROJECT_NAME:-peach}"
STACK_NAME="${COGNITO_STACK_NAME:-${PROJECT_NAME}-cognito}"
FRONTEND_STACK_NAME="${FRONTEND_STACK_NAME:-${PROJECT_NAME}-frontend}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"
LOCAL_URL="${LOCAL_FRONTEND_URL:-http://localhost:${FRONTEND_PORT:-3000}}"

# Same helper as deploy-backend.sh: rewrite one KEY=VALUE, keep every other line.
env_set() {
  KEY="$1" VALUE="$2" ENV_FILE="${ENV_FILE}" python3 - <<'PY'
import os, re

key, value, path = os.environ["KEY"], os.environ["VALUE"], os.environ["ENV_FILE"]
lines = open(path).read().splitlines() if os.path.exists(path) else []
pattern = re.compile(rf"^{re.escape(key)}=")

for i, line in enumerate(lines):
    if pattern.match(line):
        lines[i] = f"{key}={value}"
        break
else:
    lines.append(f"{key}={value}")

open(path, "w").write("\n".join(lines) + "\n")
PY
  log "wrote ${1}=${2} to .env"
}

# --- preflight --------------------------------------------------------------

for tool in aws python3; do
  command -v "${tool}" >/dev/null 2>&1 || die "${tool} is required but not installed"
done
aws sts get-caller-identity >/dev/null 2>&1 \
  || die "no usable AWS credentials - set AWS_PROFILE or the AWS_* keys in .env"

[[ -n "${COGNITO_DOMAIN_PREFIX:-}" ]] \
  || die "set COGNITO_DOMAIN_PREFIX in .env, e.g. COGNITO_DOMAIN_PREFIX=${PROJECT_NAME}-yourname"

if [[ -n "${GOOGLE_CLIENT_ID:-}" && -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  die "GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is empty"
fi

# --- where may Cognito send the browser back to? ----------------------------

# The callback path has no trailing slash: the Next.js export here is built
# without trailingSlash, and Cognito compares URLs character by character.
CALLBACKS=("${LOCAL_URL}/auth/callback")
LOGOUTS=("${LOCAL_URL}/")

SITE_URL="$(aws cloudformation describe-stacks --stack-name "${FRONTEND_STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>/dev/null || true)"
if [[ -n "${SITE_URL}" && "${SITE_URL}" != "None" ]]; then
  SITE_URL="${SITE_URL%/}"
  CALLBACKS=("${SITE_URL}/auth/callback" "${CALLBACKS[@]}")
  LOGOUTS=("${SITE_URL}/" "${LOGOUTS[@]}")
else
  warn "no ${FRONTEND_STACK_NAME} stack yet - only ${LOCAL_URL} is allowed;"
  warn "re-run make deploy-cognito after make deploy-frontend"
  SITE_URL=""
fi

join() { local IFS=,; echo "$*"; }

# --- deploy -----------------------------------------------------------------

# Parameters through a 0600 file, so the Google secret never shows up in `ps`.
PARAMS_FILE="$(mktemp)"
chmod 600 "${PARAMS_FILE}"
trap 'rm -f "${PARAMS_FILE}"' EXIT

PROJECT_NAME="${PROJECT_NAME}" \
DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX}" \
CALLBACK_URLS="$(join "${CALLBACKS[@]}")" \
LOGOUT_URLS="$(join "${LOGOUTS[@]}")" \
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}" \
python3 - "${PARAMS_FILE}" <<'PY'
import json, os, sys

params = {
    "ProjectName": os.environ["PROJECT_NAME"],
    "DomainPrefix": os.environ["DOMAIN_PREFIX"],
    "CallbackUrls": os.environ["CALLBACK_URLS"],
    "LogoutUrls": os.environ["LOGOUT_URLS"],
    "GoogleClientId": os.environ["GOOGLE_CLIENT_ID"],
    "GoogleClientSecret": os.environ["GOOGLE_CLIENT_SECRET"],
}
with open(sys.argv[1], "w") as fh:
    json.dump([{"ParameterKey": k, "ParameterValue": v} for k, v in params.items()], fh)
PY

if ! aws cloudformation describe-stacks --stack-name "${STACK_NAME}" >/dev/null 2>&1; then
  log "first deploy - creating ${STACK_NAME}"
else
  log "updating ${STACK_NAME}"
fi

if ! aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE}" \
  --parameter-overrides "file://${PARAMS_FILE}" \
  --no-fail-on-empty-changeset \
  --tags "PROJECT_NAME=${PROJECT_NAME}"; then
  warn "deploy failed - most recent failure reasons:"
  aws cloudformation describe-stack-events --stack-name "${STACK_NAME}" \
    --max-items 40 \
    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`||ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
    --output table >&2 || true
  exit 1
fi

outputs() {
  aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

USER_POOL_ID="$(outputs UserPoolId)"
CLIENT_ID="$(outputs ClientId)"
DOMAIN="$(outputs Domain)"
GOOGLE_ENABLED="$(outputs GoogleEnabled)"

# --- report -----------------------------------------------------------------

env_set COGNITO_REGION "${AWS_REGION}"
env_set COGNITO_USER_POOL_ID "${USER_POOL_ID}"
env_set COGNITO_CLIENT_ID "${CLIENT_ID}"
env_set COGNITO_DOMAIN "${DOMAIN}"
env_set COGNITO_GOOGLE_ENABLED "${GOOGLE_ENABLED}"

echo
echo "  user pool    ${USER_POOL_ID}"
echo "  client       ${CLIENT_ID}"
echo "  login host   https://${DOMAIN}"
echo "  google       ${GOOGLE_ENABLED}"
echo "  callbacks    $(join "${CALLBACKS[@]}")"
echo
echo "Google OAuth client (Web application) must have:"
echo "  Authorised JavaScript origin   https://${DOMAIN}"
echo "  Authorised redirect URI        $(outputs GoogleRedirectUri)"
echo
echo "Next: make deploy-frontend (it builds the ids above into the bundle)."
[[ -n "${SITE_URL}" ]] && echo "Then submit: ${SITE_URL}/login/"
echo
