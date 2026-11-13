# Spry's core on Google Cloud (Lab 9): Cloud Run + Cloud SQL + Artifact
# Registry + Secret Manager, and Firebase for the site.
#
# Its own HCP Terraform workspace (spry-gcp, execution mode Local), so a plan
# here can never touch the AWS workspace (spry-dev) and the other way round.
# Local execution: the plan runs on the laptop with the gcloud application
# default credentials (`gcloud auth application-default login`) - no JSON key
# exists anywhere - and the state is still kept and locked in HCP Terraform.

terraform {
  required_version = ">= 1.6"

  cloud {
    organization = "ooad_lab_oliavaranytsa"
    workspaces {
      name = "spry-gcp"
    }
  }

  required_providers {
    google      = { source = "hashicorp/google", version = "~> 7.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 7.0" }
    random      = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # Signed in as a person (ADC), so APIs bill and count quota against this
  # project rather than the gcloud CLI's own one.
  user_project_override = true
  billing_project       = var.project_id
  default_labels        = { project = "spry", managed-by = "terraform" }
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}
