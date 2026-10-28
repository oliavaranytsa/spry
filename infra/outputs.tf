# Everything the Makefile, the scripts and the frontend build read.
# make infra-env writes them into .env.

output "cognito_region" {
  value = var.region
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  description = "The managed login host, without https://."
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "cognito_google_enabled" {
  value = local.google_enabled
}

output "google_redirect_uri" {
  description = "The Google OAuth client's authorised redirect URI."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com/oauth2/idpresponse"
}

output "reports_bucket" {
  value = aws_s3_bucket.reports.bucket
}

output "reports_queue_url" {
  value = aws_sqs_queue.requests.url
}

output "reports_dlq_url" {
  value = aws_sqs_queue.requests_dlq.url
}

output "parser_url" {
  description = "POST here with a Cognito access token. No trailing slash."
  value       = trimsuffix(aws_lambda_function_url.parser.function_url, "/")
}
