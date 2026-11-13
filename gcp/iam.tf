# One service account per program (Lab 9, Part 0). Neither gets a key.

# The identity the API runs as on Cloud Run: it may reach Cloud SQL and read
# one secret, and nothing else. Not the default compute account, which
# starts with Editor on the whole project.
resource "google_service_account" "api" {
  account_id   = "spry-api"
  display_name = "Spry API (Cloud Run)"
  depends_on   = [google_project_service.this]
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.api.member
}

# The identity Terraform would run as from CI (GitHub Actions or HCP
# Terraform through Workload Identity Federation - the stretch goal). Today
# Terraform runs on the laptop as its owner; the roles below are the ones
# this configuration needs, so CI can take over without Owner or Editor.
resource "google_service_account" "terraform" {
  account_id   = "spry-terraform"
  display_name = "Terraform for Spry (CI, no key)"
  depends_on   = [google_project_service.this]
}

resource "google_project_iam_member" "terraform" {
  for_each = toset([
    "roles/run.admin",
    "roles/cloudsql.admin",
    "roles/artifactregistry.admin",
    "roles/secretmanager.admin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/iam.serviceAccountUser",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.terraform.member
}
