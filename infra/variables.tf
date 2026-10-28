# Non-secret values live in terraform.tfvars (in Git). Secrets and personal
# values are workspace variables in HCP Terraform, never in the repository:
#   google_client_secret (sensitive), reports_sender, budget_email.

variable "project_name" {
  type        = string
  description = "Prefix of every resource name, and the PROJECT_NAME tag."
}

variable "region" {
  type        = string
  description = "Where Spry runs."
}

# --- sign-in (auth.tf) -------------------------------------------------------

variable "cognito_domain_prefix" {
  type        = string
  description = "https://<prefix>.auth.<region>.amazoncognito.com. Changing it replaces the domain."
}

variable "local_frontend_url" {
  type        = string
  default     = "http://localhost:3000"
  description = "Allowed as a sign-in callback next to the deployed site."
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Google OAuth client. Empty means email and password only."
}

variable "google_client_secret" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Set as a sensitive workspace variable in HCP Terraform, never in a file."
}

# --- weekly report (reports.tf) ---------------------------------------------

variable "reports_sender" {
  type        = string
  description = "An address SES verified. A workspace variable: it is personal."
}

variable "reports_recipient" {
  type        = string
  default     = ""
  description = "Empty: the report goes to the sender."
}

variable "schedule_expression" {
  type    = string
  default = "cron(0 7 ? * MON *)"
}

variable "schedule_timezone" {
  type    = string
  default = "Europe/Kyiv"
}

variable "builder_timeout" {
  type    = number
  default = 60
}

variable "queue_visibility_timeout" {
  type        = number
  default     = 360
  description = "At least six times the builder's timeout."
}

variable "fail_week" {
  type        = string
  default     = ""
  description = "Lab 5, Step 7: the builder fails on purpose for this ISO week."
}

variable "reports_log_retention_days" {
  type    = number
  default = 7
}

# --- agenda parser (ai.tf) --------------------------------------------------

variable "parser_model" {
  type = string
}

variable "parser_region" {
  type        = string
  default     = "us-east-1"
  description = "Where Bedrock is called, whatever region Spry runs in."
}

variable "parser_log_retention_days" {
  type    = number
  default = 14
}

# --- budget (budget.tf) -----------------------------------------------------

variable "budget_email" {
  type        = string
  description = "Where the monthly budget alarm goes. A workspace variable."
}

variable "budget_limit_usd" {
  type    = string
  default = "5.0"
}
