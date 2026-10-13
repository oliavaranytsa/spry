#!/usr/bin/env bash
# The trigger lines of the report pipeline: which event started each run.
# SINCE=24h looks further back (default 1h).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
PROJECT_NAME="${PROJECT_NAME:-peach}"
export AWS_DEFAULT_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

for fn in report-builder report-mailer; do
  printf '\033[36m==>\033[0m %s\n' "${PROJECT_NAME}-${fn}"
  aws logs tail "/aws/lambda/${PROJECT_NAME}-${fn}" --since "${SINCE:-1h}" \
    --filter-pattern "\"${fn}\"" --format short
done
