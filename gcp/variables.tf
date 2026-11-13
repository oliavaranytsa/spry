variable "project_id" {
  description = "The Google Cloud project (permanent, globally unique)."
  type        = string
}

variable "region" {
  description = "Where Cloud Run, Cloud SQL and the registry live."
  type        = string
  default     = "us-central1"
}

variable "api_image" {
  description = <<-EOT
    The API image in Artifact Registry. Empty on the first apply, which builds
    everything the image needs; scripts/deploy-gcp.sh api pushes an image and
    writes this into image.auto.tfvars, and the next apply creates Cloud Run.
  EOT
  type        = string
  default     = ""
}

variable "db_tier" {
  description = "Cloud SQL machine type. db-f1-micro: shared core, 0.6 GB, $0.0105 an hour while running."
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_gb" {
  description = "SSD size; billed while the instance is stopped too."
  type        = number
  default     = 10
}

# Sign-in stays on AWS: the API verifies Cognito tokens wherever it runs.
# Not secrets - the pool id and client id are in every page of the site.
variable "cognito_region" {
  type = string
}

variable "cognito_user_pool_id" {
  type = string
}

variable "cognito_client_id" {
  type = string
}
