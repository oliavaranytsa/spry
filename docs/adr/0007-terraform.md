# ADR 0007: Describe the infrastructure in Terraform, run by HCP Terraform

- **Status:** accepted
- **Date:** 2026-10-28
- **Lab:** 7, "The cloud as code: from CloudFormation to Terraform"

## Context

By Lab 6 Spry's infrastructure was spread over six CloudFormation stacks, each
deployed by its own shell script from a laptop or from GitHub Actions:

- `spry-cognito` (sign-in), `spry-reports` (the weekly report: queue,
  schedule, builder and mailer Lambdas, bucket, S3 endpoint, SES identity) and
  `spry-ai` (the agenda parser and its function URL);
- `spry-backend` (API Lambda, Aurora, secret), `spry-frontend` (S3 +
  CloudFront) and `spry-github-oidc` (the GitHub deploy role);
- and one resource in no template at all: the `spry-monthly` budget, created
  by `deploy-ai.sh` with the AWS CLI.

What hurt:

- **No preview of changes outside the template.** A change made in the
  console (Part 0: a timeout raised by hand) stays invisible until someone
  runs drift detection, and the next deploy silently overwrites it or not.
- **Values passed by hand between stacks.** The scripts read one stack's
  outputs and wrote them to `.env`, then passed them as another stack's
  parameters. The order of `make deploy-*` was knowledge in someone's head.
- **No review step for infrastructure.** A template change went straight to
  `aws cloudformation deploy`; the pull request showed YAML, not what would
  happen to the account.
- **The budget was invisible.** Nothing described it; a new account would not
  have it.

The constraints: the site, the users in the pool and the sign-in links must
not change; nothing may be re-created (a new user pool means every account is
gone, a new client ID means every session ends); the course budget is small.

## Decision

1. **Terraform** (`hashicorp/aws ~> 6.0`) describes sign-in, the weekly
   report, the agenda parser and the budget: `infra/auth.tf`,
   `infra/reports.tf`, `infra/ai.tf`, `infra/budget.tf`. About 40 resources.
2. **HCP Terraform keeps the state and runs the plans and applies**
   (organization `ooad_lab_oliavaranytsa`, workspace `spry-dev`, remote
   execution). State is never on a laptop, it is locked during a run, and
   every run is in the workspace history.
3. **No AWS keys anywhere.** The workspace assumes the IAM role
   `hcp-terraform-ooad_lab_oliavaranytsa` through OIDC (dynamic provider
   credentials). The role and its trust are themselves Terraform, in
   `infra/bootstrap/`, applied once from a laptop with local state; the trust
   is limited to this organization and this workspace.
4. **VCS-driven workflow.** The workspace watches `infra/` on `main`. A pull
   request gets a speculative plan as a check; a merge applies it. The
   backend's GitHub Actions workflow ignores `infra/**`.
5. **Adopt, never re-create.** The CloudFormation resources were handed over
   without touching them:
   1. `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` on every
      resource of the three stacks, deployed as a stack update;
   2. `delete-stack`: the stacks are gone, the resources stay;
   3. `import` blocks (`infra/imports.tf`) with the real IDs, then `plan` until
      it read *40 to import, 0 to add, 0 to destroy*;
   4. `apply`, then `plan` → *No changes*; `imports.tf` deleted.

   To keep the plan clean, the code matches what exists, not what would be
   chosen today: the role names CloudFormation generated
   (`spry-reports-BuilderRole-v2z4ozYBO93p`) and the permission statement IDs
   are kept; `generate_secret` is left out of the Cognito client (it is not
   read back on import, and `false` forces a replacement); the SQS message
   size is the current AWS default, 1 MiB.
6. **Split by owner.** The backend, frontend and GitHub role stay in
   CloudFormation. Terraform reads them through data sources (the site URL
   from `spry-frontend`, the image, architecture, VPC and `DATABASE_URL` from
   the `spry-backend` function) and never changes them. The container image
   belongs to the application pipeline, so Terraform ignores `image_uri` on
   the builder and the parser.
7. **Inputs by sensitivity.** Non-personal values in `infra/terraform.tfvars`
   (committed); personal ones (`reports_sender`, `budget_email`) and secrets
   (`google_client_secret`, sensitive) as workspace variables. `.env` gets
   the outputs through `make infra-env`.

## Alternatives considered

- **Stay with CloudFormation, add change sets and drift detection.** Fixes the
  preview, not the passing of values between stacks or the budget made by a
  script; drift detection is a separate manual step.
- **Terraform with an S3 backend and a DynamoDB lock.** No vendor account, but
  one more bucket to protect, credentials on whoever runs it, and no run
  history or PR checks without building them in GitHub Actions.
- **Re-create instead of import** (`terraform apply` on an empty state, then
  delete the stacks). Simpler, but a new user pool deletes every account, a
  new function URL breaks the frontend build, and the bucket name is taken.
- **Move everything, backend and frontend included.** One tool, but Aurora
  and CloudFront are the slowest and costliest things to get wrong, and the
  backend deploy rolls the image every push. Left for later, the same way.
- **AWS CDK or Pulumi.** Real languages, but CDK still deploys through
  CloudFormation (same drift story), and both add a runtime to the repo.
- **OpenTofu.** Same language and providers; HCP Terraform runs Terraform,
  so it is Terraform here.

## Consequences

- `terraform plan` shows any difference between the code and AWS, a console
  change included (see the drift test in the Lab 7 notes). Every
  infrastructure change has a reviewable plan in its pull request.
- The import apply changed four things on purpose, all harmless: a
  `PROJECT_NAME` tag on the budget, the mailer's code re-uploaded from
  `infra/mailer/index.py` (same code, different zip), and two values
  (`client_secret`, `DATABASE_URL`) marked sensitive.
- **The state holds secrets.** `DATABASE_URL` (read from the backend
  function) and the Google client secret are in the state in clear text.
  HCP Terraform encrypts state at rest and restricts who can read it; nobody
  should be given state access who should not see the database password.
- **Two tools for a while.** A new developer needs both the AWS CLI and
  Terraform, and has to know which stack is where (the table in the README).
- After the VCS connection, `terraform apply` from a laptop is refused; the
  only way to change infrastructure is a merge. A hotfix is a pull request.
- The kept CloudFormation names (`…-BuilderRole-v2z4ozYBO93p`) are ugly.
  Renaming a role re-creates it; that can be done later, one role at a time.
- If HCP Terraform is down, nobody can apply. The resources keep running.
