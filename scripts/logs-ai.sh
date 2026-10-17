#!/usr/bin/env bash
# The agenda parser's JSON log lines, one per parse: agenda_parsed (user,
# model, prompt version, tokens, latency, cost) and agenda_failed.
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

aws logs tail "/aws/lambda/${PROJECT_NAME}-agenda-parser" --since "${SINCE:-1h}" \
  --format short --filter-pattern '{ $.event = "agenda_*" }'
