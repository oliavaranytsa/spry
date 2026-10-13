#!/usr/bin/env bash
# Ask for a report now: put a BuildWeeklyReport command on the queue, the same
# message the Monday schedule sends. WEEK=2026-W39 rebuilds that week;
# without WEEK the builder picks the previous ISO week.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

if [[ -f "${ROOT}/.env" ]]; then
  preset="$(export -p)"
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
  eval "${preset}"
fi

for var in AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [[ -n "${!var:-}" ]] || unset "${var}"
done

export AWS_DEFAULT_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

[[ -n "${REPORTS_QUEUE_URL:-}" ]] || die "REPORTS_QUEUE_URL is not in .env - run make deploy-reports first"

WEEK="${WEEK:-}"
if [[ -n "${WEEK}" ]]; then
  [[ "${WEEK}" =~ ^[0-9]{4}-W[0-9]{2}$ ]] || die "WEEK must look like 2026-W39, got '${WEEK}'"
  BODY="{\"week\": \"${WEEK}\", \"source\": \"make\"}"
else
  BODY='{"week": null, "source": "make"}'
fi

MESSAGE_ID="$(aws sqs send-message --queue-url "${REPORTS_QUEUE_URL}" \
  --message-body "${BODY}" --query MessageId --output text)"

log "sent ${BODY}"
log "message ${MESSAGE_ID}"
echo
echo "Within a minute: a new object in s3://${REPORTS_BUCKET:-<bucket>}/reports/,"
echo "the email, and the log lines - make logs-reports"
