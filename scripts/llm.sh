#!/usr/bin/env bash
# Run one of the app.ai modules inside the local backend container, with your
# AWS credentials, so the laptop needs no Python of its own:
#
#   scripts/llm.sh app.ai.hello                      (make llm-hello)
#   scripts/llm.sh app.ai.agenda "text to parse"     (make parse TEXT="...")
#   scripts/llm.sh app.ai.agenda < agenda.txt        (make parse FILE=agenda.txt)
#
# The container has no ~/.aws, so the credentials of your usual profile are
# exported for this one command and passed in as environment variables.
# PARSER_MODEL=anthropic.claude-haiku-5-5 switches the model for one run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

[[ $# -ge 1 ]] || die "usage: scripts/llm.sh <module> [text]"
MODULE="$1"
shift

command -v aws >/dev/null 2>&1 || die "the aws CLI is required"
CREDS="$(aws configure export-credentials --format env-no-export 2>/dev/null)" \
  || die "no usable AWS credentials - set AWS_PROFILE or the AWS_* keys in .env"

ENV_ARGS=()
while IFS='=' read -r key value; do
  [[ -n "${key}" && -n "${value}" ]] && ENV_ARGS+=(-e "${key}=${value}")
done <<< "${CREDS}"
ENV_ARGS+=(-e "PARSER_MODEL=${PARSER_MODEL:-anthropic.claude-opus-5-5}")
ENV_ARGS+=(-e "PARSER_REGION=${PARSER_REGION:-us-east-1}")

cd "${ROOT}"
docker compose ps --status running backend 2>/dev/null | grep -q backend \
  || die "the backend container is not running - make up first"

if [[ $# -gt 0 ]]; then
  exec docker compose exec -T "${ENV_ARGS[@]}" backend python -m "${MODULE}" "$@"
else
  exec docker compose exec -T "${ENV_ARGS[@]}" backend python -m "${MODULE}"
fi
