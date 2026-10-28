# Sign-in (Lab 4), formerly infra/cognito.yaml: a Cognito user pool with self
# sign-up by email and password, Google as a federated identity provider, and
# Cognito's managed login page on a prefix domain.
#
# The user pool holds every account that ever signed up. Read every plan for
# "forces replacement" on aws_cognito_user_pool.main: a replaced pool is an
# empty pool.

locals {
  google_enabled = var.google_client_id != ""
}

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-users"

  # Sign in with an email; there is no separate username.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  # Essentials tier: managed login needs it; 10,000 monthly users are free.
  user_pool_tier = "ESSENTIALS"

  # Off, as in the template, so the pool can be deleted at the end of the
  # course. A real product would turn this on.
  deletion_protection = "INACTIVE"

  admin_create_user_config {
    # Self sign-up stays on, so anyone (the lecturer too) can register.
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }
}

resource "aws_cognito_identity_provider" "google" {
  count = local.google_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  # Cognito stores the Google endpoints next to the id and the secret; they
  # are written out so that the plan does not report them as a difference.
  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  # Without these a Google user arrives with no email for the header.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }
}

# A public client: a browser cannot keep a secret, so it gets none and uses
# the authorization code flow with PKCE instead.
#
# generate_secret is left out on purpose: it is not read back on import, so
# writing "false" here makes Terraform replace the client (new client id,
# everyone signed out). Leaving it out means "no secret", the default.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  # A reference, not the string "Google": the client waits for the provider,
  # which is what CloudFormation needed the !If trick for.
  supported_identity_providers = concat(
    ["COGNITO"],
    aws_cognito_identity_provider.google[*].provider_name,
  )

  callback_urls = [
    "${var.local_frontend_url}/auth/callback",
    "${local.site_url}/auth/callback",
  ]
  logout_urls = [
    "${var.local_frontend_url}/",
    "${local.site_url}/",
  ]

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
  refresh_token_validity        = 30
  auth_session_validity         = 3
}

resource "aws_cognito_user_pool_domain" "main" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2
}

# A version 2 domain shows no sign-in page until it has a style.
resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id                = aws_cognito_user_pool.main.id
  client_id                   = aws_cognito_user_pool_client.web.id
  use_cognito_provided_values = true

  depends_on = [aws_cognito_user_pool_domain.main]
}
