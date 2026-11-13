# The images live in Artifact Registry (0.5 GB free).
resource "google_artifact_registry_repository" "spry" {
  repository_id = "spry"
  location      = var.region
  format        = "DOCKER"
  description   = "Spry container images"

  # Keep the registry inside the free 0.5 GB: only the newest images stay.
  cleanup_policies {
    id     = "keep-latest-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }
  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      older_than = "86400s"
    }
  }

  depends_on = [google_project_service.this]
}

# The API on Cloud Run: the same image Docker Compose runs (the "runtime"
# stage of backend/Dockerfile), no Lambda adapter. Created once an image has
# been pushed (var.api_image).
resource "google_cloud_run_v2_service" "api" {
  count = var.api_image == "" ? 0 : 1

  name                = "spry-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0 # scales to zero: idle costs nothing
      max_instance_count = 2 # db-f1-micro allows ~25 connections
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8000 # Cloud Run passes it in PORT; the entrypoint reads it
      }

      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true # billed only while handling a request
        startup_cpu_boost = true
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }
      # One connection per request and none kept open: the instance may sit
      # idle until it is reclaimed, and the small database has few slots.
      env {
        name  = "DB_POOLING"
        value = "false"
      }
      env {
        name  = "COGNITO_REGION"
        value = var.cognito_region
      }
      env {
        name  = "COGNITO_USER_POOL_ID"
        value = var.cognito_user_pool_id
      }
      env {
        name  = "COGNITO_CLIENT_ID"
        value = var.cognito_client_id
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # The entrypoint runs the migrations before uvicorn starts: give it time.
      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_iam_member.api_reads_database_url,
    google_project_iam_member.api_sql_client,
  ]
}

# Public: the API checks the Cognito token itself on every protected route,
# and Firebase Hosting can only forward to a public service.
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.api_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Firebase on top of the project, for Hosting. The site itself is deployed
# with the Firebase CLI (scripts/deploy-gcp.sh frontend).
resource "google_firebase_project" "this" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.this]
}
