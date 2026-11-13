output "image_repository" {
  description = "Push the API image here."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.spry.repository_id}"
}

output "api_url" {
  description = "Cloud Run's own URL (the site reaches it as /api on its own origin)."
  value       = length(google_cloud_run_v2_service.api) > 0 ? google_cloud_run_v2_service.api[0].uri : ""
}

output "site_url" {
  value = "https://${var.project_id}.web.app"
}

output "db_instance" {
  value = google_sql_database_instance.main.name
}

output "db_connection_name" {
  value = google_sql_database_instance.main.connection_name
}
