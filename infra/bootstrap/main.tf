# One-time bootstrap: lets HCP Terraform reach this AWS account without keys.
#
# HCP Terraform signs an OIDC token for every run ("organization X, workspace
# Y, plan or apply phase"). AWS trusts tokens from app.terraform.io through the
# identity provider below and exchanges them for short-lived credentials of
# one role. This folder has to exist before HCP Terraform can do anything, so
# it is applied once, from a laptop, with a local state:
#
#   cd infra/bootstrap
#   terraform init
#   terraform apply -var tfc_organization=<your HCP Terraform organization>
#
# Then put the role_arn output into the spry-dev workspace as
# TFC_AWS_RUN_ROLE_ARN, next to TFC_AWS_PROVIDER_AUTH=true.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

variable "tfc_organization" {
  type        = string
  description = "The HCP Terraform organization, e.g. ooad-oliavaranytsa."
}

variable "tfc_workspace" {
  type        = string
  default     = "spry-dev"
  description = "The one workspace allowed to assume the role."
}

variable "region" {
  type    = string
  default = "eu-north-1"
}

variable "project_name" {
  type    = string
  default = "spry"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PROJECT_NAME = var.project_name
      ManagedBy    = "terraform"
    }
  }
}

data "tls_certificate" "tfc" {
  url = "https://app.terraform.io"
}

resource "aws_iam_openid_connect_provider" "tfc" {
  url             = "https://app.terraform.io"
  client_id_list  = ["aws.workload.identity"]
  thumbprint_list = [data.tls_certificate.tfc.certificates[0].sha1_fingerprint]
}

resource "aws_iam_role" "tfc" {
  name        = "hcp-terraform-${var.tfc_organization}"
  description = "Assumed by HCP Terraform runs of ${var.tfc_organization}/${var.tfc_workspace}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.tfc.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "app.terraform.io:aud" = "aws.workload.identity" }
        # One workspace only, both plan and apply phases. The lab's example
        # allows any workspace of the organization (workspace:*).
        StringLike = {
          "app.terraform.io:sub" = "organization:${var.tfc_organization}:project:*:workspace:${var.tfc_workspace}:run_phase:*"
        }
      }
    }]
  })
}

# As the lab says: fine for the class project. docs/adr/0007-terraform.md
# lists what a narrower policy would contain.
resource "aws_iam_role_policy_attachment" "tfc" {
  role       = aws_iam_role.tfc.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "role_arn" {
  value = aws_iam_role.tfc.arn
}
