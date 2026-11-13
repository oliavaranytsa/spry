# Cloud SQL for PostgreSQL, the smallest shared-core tier. Unlike Aurora it
# does not pause: it bills by the hour until it is stopped
# (scripts/deploy-gcp.sh db-stop) or destroyed.
resource "google_sql_database_instance" "main" {
  name                = "spry-db"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = false # a lab: terraform destroy must be able to remove it

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE" # shared-core tiers exist only in Enterprise
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.db_disk_gb
    disk_autoresize   = false

    backup_configuration {
      enabled = false # demo data; on a real project, on
    }

    # A public IP with no authorised networks: nothing connects to it
    # directly. Cloud Run reaches it through the Cloud SQL connector, which
    # checks the service account's IAM role instead.
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }

  # Stopping and starting is done with gcloud (db-stop / db-start), not here.
  lifecycle {
    ignore_changes = [settings[0].activation_policy]
  }

  depends_on = [google_project_service.this]
}

resource "google_sql_database" "spry" {
  name     = "spry"
  instance = google_sql_database_instance.main.name
}

# Letters and digits only, so it goes into a URL without escaping.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "spry" {
  name     = "spry"
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
  # The instance takes its users with it on destroy; deleting the user first
  # fails while it still owns the tables.
  deletion_policy = "ABANDON"
}

# The whole connection string is the secret: the app reads DATABASE_URL and
# nothing else changes. The host is the Unix socket Cloud Run mounts at
# /cloudsql/<connection name>.
resource "google_secret_manager_secret" "database_url" {
  secret_id = "spry-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql+asyncpg://${google_sql_user.spry.name}:${random_password.db.result}@/${google_sql_database.spry.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
}

resource "google_secret_manager_secret_iam_member" "api_reads_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}
