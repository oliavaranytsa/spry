#!/usr/bin/env bash
# Create or update the weekly-report stack in infra/reports.yaml.
#
# Everything the builder shares with the API - the image, the subnets, the
# security group the database admits, the database URL - is read off the
# deployed backend function, so deploy the backend first (make deploy-backend:
# its image is the one that contains app/reports).
#
# Needs REPORTS_SENDER in .env: an email address you can read. REPORTS_RECIPIENT
# is optional (default: the sender). SCHEDULE=... and FAIL_WEEK=... override
# the schedule and the lab's failure switch for one deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/reports.yaml"
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
STACK_NAME="${REPORTS_STACK_NAME:-${PROJECT_NAME}-reports}"
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

[[ -n "${REPORTS_SENDER:-}" ]] \
  || die "set REPORTS_SENDER in .env - an email address you can read (SES verifies it)"

aws lambda get-function --function-name "${BACKEND_FUNCTION}" >/dev/null 2>&1 \
  || die "no ${BACKEND_FUNCTION} function in ${AWS_REGION} - run make deploy-backend first"

# --- what the builder shares with the API -----------------------------------

fn() {
  aws lambda get-function-configuration --function-name "${BACKEND_FUNCTION}" \
    --query "$1" --output text
}

IMAGE_URI="$(aws lambda get-function --function-name "${BACKEND_FUNCTION}" \
  --query Code.ImageUri --output text)"
ARCHITECTURE="$(fn 'Architectures[0]')"
VPC_ID="$(fn VpcConfig.VpcId)"
SUBNETS="$(fn 'VpcConfig.SubnetIds' | tr '\t' ',')"
SECURITY_GROUP="$(fn 'VpcConfig.SecurityGroupIds[0]')"
DATABASE_URL_AWS="$(fn Environment.Variables.DATABASE_URL)"

# Default-VPC subnets usually have no route table of their own and use the
# VPC's main one; take every route table in the VPC so the endpoint reaches all.
ROUTE_TABLES="$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query 'RouteTables[].RouteTableId' --output text | tr '\t' ',')"

[[ -n "${VPC_ID}" && "${VPC_ID}" != "None" ]] || die "${BACKEND_FUNCTION} is not in a VPC"

log "image       ${IMAGE_URI}"
log "network     ${VPC_ID}, subnets ${SUBNETS}, sg ${SECURITY_GROUP}"
log "routes      ${ROUTE_TABLES}"

# --- deploy -----------------------------------------------------------------

# Parameters through a 0600 file: the database URL holds the password.
PARAMS_FILE="$(mktemp)"
chmod 600 "${PARAMS_FILE}"
trap 'rm -f "${PARAMS_FILE}"' EXIT

PROJECT_NAME="${PROJECT_NAME}" \
IMAGE_URI="${IMAGE_URI}" \
ARCHITECTURE="${ARCHITECTURE}" \
VPC_ID="${VPC_ID}" \
SUBNETS="${SUBNETS}" \
SECURITY_GROUP="${SECURITY_GROUP}" \
ROUTE_TABLES="${ROUTE_TABLES}" \
DATABASE_URL_AWS="${DATABASE_URL_AWS}" \
SENDER="${REPORTS_SENDER}" \
RECIPIENT="${REPORTS_RECIPIENT:-}" \
SCHEDULE="${SCHEDULE:-cron(0 7 ? * MON *)}" \
FAIL_WEEK="${FAIL_WEEK:-}" \
python3 - "${PARAMS_FILE}" <<'PY'
import json, os, sys

params = {
    "ProjectName": os.environ["PROJECT_NAME"],
    "ImageUri": os.environ["IMAGE_URI"],
    "Architecture": os.environ["ARCHITECTURE"],
    "VpcId": os.environ["VPC_ID"],
    "SubnetIds": os.environ["SUBNETS"],
    "SecurityGroupId": os.environ["SECURITY_GROUP"],
    "RouteTableIds": os.environ["ROUTE_TABLES"],
    "DatabaseUrl": os.environ["DATABASE_URL_AWS"],
    "SenderEmail": os.environ["SENDER"],
    "RecipientEmail": os.environ["RECIPIENT"],
    "FailWeek": os.environ["FAIL_WEEK"],
    # Always sent: a parameter left out keeps its previous value, so a
    # one-off SCHEDULE="rate(5 minutes)" would otherwise stay forever.
    "ScheduleExpression": os.environ["SCHEDULE"],
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

BUCKET="$(outputs BucketName)"
QUEUE_URL="$(outputs QueueUrl)"
env_set REPORTS_BUCKET "${BUCKET}"
env_set REPORTS_QUEUE_URL "${QUEUE_URL}"

# --- report -----------------------------------------------------------------

verified() {
  aws sesv2 get-email-identity --email-identity "$1" \
    --query VerifiedForSendingStatus --output text 2>/dev/null || echo "unknown"
}

echo
echo "  bucket      s3://${BUCKET}/reports/"
echo "  queue       ${QUEUE_URL}"
echo "  dlq         $(outputs DeadLetterQueueUrl)"
echo "  schedule    $(aws scheduler get-schedule --name "${PROJECT_NAME}-weekly-report" --query ScheduleExpression --output text) Europe/Kyiv"
echo "  builder     $(outputs BuilderLogGroup)"
echo "  mailer      $(outputs MailerLogGroup)"
echo "  sender      ${REPORTS_SENDER} (verified: $(verified "${REPORTS_SENDER}"))"
if [[ -n "${REPORTS_RECIPIENT:-}" && "${REPORTS_RECIPIENT}" != "${REPORTS_SENDER}" ]]; then
  echo "  recipient   ${REPORTS_RECIPIENT} (verified: $(verified "${REPORTS_RECIPIENT}"))"
fi
[[ -n "${FAIL_WEEK:-}" ]] && warn "FAIL_WEEK=${FAIL_WEEK}: the builder fails for that week on purpose"
echo
echo "SES sent a verification link to each address on the first deploy."
echo "Click it, then: make report-now WEEK=<an ISO week, e.g. 2026-W41>"
echo
