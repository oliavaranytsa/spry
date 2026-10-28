# Terraform for the parts of Spry that Labs 4-6 added: sign-in (auth.tf), the
# weekly report (reports.tf) and the agenda parser (ai.tf). The older stacks
# from the course template (backend, frontend, github-oidc) stay in
# CloudFormation; data.tf reads what is needed from them.
#
# Runs in HCP Terraform (workspace spry-dev, remote execution). AWS access is
# a short-lived role per run through OIDC: infra/bootstrap creates the role,
# the workspace variables TFC_AWS_PROVIDER_AUTH / TFC_AWS_RUN_ROLE_ARN use it.
# Nobody needs AWS keys to change this infrastructure.

terraform {
  required_version = ">= 1.10"

  cloud {
    organization = "ooad_lab_oliavaranytsa"

    workspaces {
      name = "spry-dev"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region = var.region

  # Every resource that accepts tags gets the project tag, as in Labs 4-6.
  default_tags {
    tags = {
      PROJECT_NAME = var.project_name
    }
  }
}
