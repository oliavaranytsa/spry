# Non-secret values only. Secrets and personal addresses are workspace
# variables in HCP Terraform (see variables.tf).
project_name              = "spry"
region                    = "eu-north-1"
cognito_domain_prefix     = "spry-olia"
parser_model              = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
parser_log_retention_days = 30
# Applied by HCP Terraform on every merge to main that touches infra/.
