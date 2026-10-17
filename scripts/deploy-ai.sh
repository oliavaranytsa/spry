#!/usr/bin/env bash
# Create or update the agenda-parser stack in infra/ai.yml: the parser Lambda
# (same image as the API, another command), its function URL, and the monthly
# budget alarm. Writes PARSER_URL to .env for make deploy-frontend.
#
# The image is read off the deployed backend function, so deploy the backend
# first (make deploy-backend): its image is the one with app/ai and anthropic.
#
# Optional in .env: PARSER_MODEL (default Opus 5.5), BUDGET_EMAIL (default
# REPORTS_SENDER; empty and no sender = no budget), AI_CORS_ORIGINS (default:
# the CloudFront site, the custom domain if any, and http://localhost:3000).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/ai.yml"
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
STACK_NAME="${AI_STACK_NAME:-${PROJECT_NAME}-ai}"
BACKEND_FUNCTION="${PROJECT_NAME}-backend"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

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

[[ -n "${COGNITO_USER_POOL_ID:-}" && -n "${COGNITO_CLIENT_ID:-}" ]] \
  || die "COGNITO_* are not set in .env - run make deploy-cognito first"

aws lambda get-function --function-name "${BACKEND_FUNCTION}" >/dev/null 2>&1 \
  || die "no ${BACKEND_FUNCTION} function in ${AWS_REGION} - run make deploy-backend first"

IMAGE_URI="$(aws lambda get-function --function-name "${BACKEND_FUNCTION}" \
  --query Code.ImageUri --output text)"
ARCHITECTURE="$(aws lambda get-function-configuration --function-name "${BACKEND_FUNCTION}" \
  --query 'Architectures[0]' --output text)"

# --- who may call it from a browser -----------------------------------------

if [[ -n "${AI_CORS_ORIGINS:-}" ]]; then
  ORIGINS="${AI_CORS_ORIGINS}"
else
  ORIGINS="http://localhost:3000"
  SITE_URL="$(aws cloudformation describe-stacks --stack-name "${PROJECT_NAME}-frontend" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>/dev/null || true)"
  [[ -n "${SITE_URL}" && "${SITE_URL}" != "None" ]] && ORIGINS="${SITE_URL%/},${ORIGINS}"
  [[ -n "${DOMAIN_NAME:-}" ]] && ORIGINS="https://${DOMAIN_NAME},${ORIGINS}"
fi

BUDGET_EMAIL="${BUDGET_EMAIL:-${REPORTS_SENDER:-}}"

log "image       ${IMAGE_URI}"
log "model       ${PARSER_MODEL:-anthropic.claude-opus-5-5} (Bedrock in ${PARSER_REGION:-us-east-1})"
log "origins     ${ORIGINS}"
log "budget      ${BUDGET_EMAIL:-(none)} at \$${BUDGET_LIMIT_USD:-5}/month"

# --- deploy -----------------------------------------------------------------

PARAMS_FILE="$(mktemp)"
trap 'rm -f "${PARAMS_FILE}"' EXIT

PROJECT_NAME="${PROJECT_NAME}" \
IMAGE_URI="${IMAGE_URI}" \
ARCHITECTURE="${ARCHITECTURE}" \
PARSER_MODEL="${PARSER_MODEL:-anthropic.claude-opus-5-5}" \
PARSER_REGION="${PARSER_REGION:-us-east-1}" \
COGNITO_REGION="${COGNITO_REGION:-${AWS_REGION}}" \
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID}" \
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID}" \
ORIGINS="${ORIGINS}" \
BUDGET_EMAIL="${BUDGET_EMAIL}" \
BUDGET_LIMIT_USD="${BUDGET_LIMIT_USD:-5}" \
python3 - "${PARAMS_FILE}" <<'PY'
import json, os, sys

params = {
    "ProjectName": os.environ["PROJECT_NAME"],
    "ImageUri": os.environ["IMAGE_URI"],
    "Architecture": os.environ["ARCHITECTURE"],
    "ParserModel": os.environ["PARSER_MODEL"],
    "ParserRegion": os.environ["PARSER_REGION"],
    "CognitoRegion": os.environ["COGNITO_REGION"],
    "CognitoUserPoolId": os.environ["COGNITO_USER_POOL_ID"],
    "CognitoClientId": os.environ["COGNITO_CLIENT_ID"],
    "AllowedOrigins": os.environ["ORIGINS"],
    # Always sent: a parameter left out keeps its previous value.
    "BudgetEmail": os.environ["BUDGET_EMAIL"],
    "BudgetLimitUsd": os.environ["BUDGET_LIMIT_USD"],
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
  --capabilities CAPABILITY_IAM \
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

PARSER_URL="$(outputs ParserUrl)"
env_set PARSER_URL "${PARSER_URL%/}"

# --- report -----------------------------------------------------------------

STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST \
  -H 'content-type: application/json' -d '{"text":"x","today":"2026-01-01","tz":"UTC"}' \
  "${PARSER_URL}" || true)"

echo
echo "  parser     ${PARSER_URL}"
echo "  logs       $(outputs LogGroupName)"
echo "  no token   HTTP ${STATUS} (401 is right: nobody gets in without signing in)"
echo
echo "Next: make deploy-frontend, so the site is built with PARSER_URL."
[[ -n "${BUDGET_EMAIL}" ]] && echo "The budget alarm goes to ${BUDGET_EMAIL}."
echo
