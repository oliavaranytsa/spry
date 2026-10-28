#!/usr/bin/env bash
# Write what Terraform manages into .env: the Cognito ids, the report queue and
# bucket, the parser URL. These used to be written by deploy-cognito.sh,
# deploy-reports.sh and deploy-ai.sh; since Lab 7 they are Terraform outputs.
#
#   make infra-env
#
# Reads the state in HCP Terraform (terraform login first). Changes nothing in
# AWS. Run it after an infrastructure change, before make deploy-frontend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v terraform >/dev/null || die "terraform is not installed"
[[ -d "${ROOT}/infra/.terraform" ]] || terraform -chdir="${ROOT}/infra" init -input=false >/dev/null

OUTPUTS="$(terraform -chdir="${ROOT}/infra" output -json)" \
  || die "could not read the outputs - run terraform login, then try again"
[[ "${OUTPUTS}" != "{}" ]] || die "the workspace has no outputs yet - apply first"

# output name in Terraform -> key in .env
OUTPUTS="${OUTPUTS}" ENV_FILE="${ENV_FILE}" python3 - <<'PY'
import json, os, re

mapping = {
    "cognito_region": "COGNITO_REGION",
    "cognito_user_pool_id": "COGNITO_USER_POOL_ID",
    "cognito_client_id": "COGNITO_CLIENT_ID",
    "cognito_domain": "COGNITO_DOMAIN",
    "cognito_google_enabled": "COGNITO_GOOGLE_ENABLED",
    "reports_bucket": "REPORTS_BUCKET",
    "reports_queue_url": "REPORTS_QUEUE_URL",
    "parser_url": "PARSER_URL",
}

outputs = json.loads(os.environ["OUTPUTS"])
path = os.environ["ENV_FILE"]
lines = open(path).read().splitlines() if os.path.exists(path) else []

for name, key in mapping.items():
    if name not in outputs:
        continue
    value = outputs[name]["value"]
    if isinstance(value, bool):
        value = "true" if value else "false"
    pattern = re.compile(rf"^{re.escape(key)}=")
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    print(f"  {key}={value}")

open(path, "w").write("\n".join(lines) + "\n")
PY
log "wrote the Terraform outputs to .env"
