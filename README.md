# Spry

A small meeting manager: a FastAPI backend, a Next.js frontend and PostgreSQL,
in one repository. It runs on a laptop with one command and is deployed to AWS
by a push to `main`.

- Frontend: <https://dkvrdkctkgp3f.cloudfront.net>
- Backend: <https://di7vj73vuvnznojkenq3x3doge0ghvbk.lambda-url.eu-north-1.on.aws> (`/docs` for the API)

The structure, contracts and versions are in [PROJECT.md](PROJECT.md); the
reasoning behind the main choices is in [docs/decisions.md](docs/decisions.md).

## Run it locally

Install Docker Desktop, then:

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>

Add a meeting and reload the page; if it is still there, the whole chain works
(component, API, ORM, Postgres).

## Everyday commands

`make help` lists them. The ones you will use most:

| Command | What it does |
|---|---|
| `make up` / `make down` | start / stop the stack |
| `make migrate` | apply Alembic migrations |
| `make test-backend` | run the backend tests |
| `make lint` / `make fmt` | lint / format both sides |

Backend tests need a Postgres to talk to:

```bash
docker compose up -d db
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://peach:peach@localhost:5432/peach_test uv run pytest -q
```

## Infrastructure

Two tools, split by how often things change:

| What | Where | Tool |
|---|---|---|
| Sign-in (Cognito), weekly report (queue, schedule, builder, mailer, bucket, SES), agenda parser (Lambda + URL), $5 budget | `infra/*.tf` | **Terraform**, state in HCP Terraform (org `ooad_lab_oliavaranytsa`, workspace `spry-dev`) |
| Backend (Lambda + Aurora), frontend (S3 + CloudFront), GitHub deploy role | `infra/backend.yaml`, `infra/frontend.yaml`, `infra/github-oidc.yaml` | CloudFormation, through the deploy scripts |

Terraform reads the CloudFormation stacks (the site URL, the backend's image,
VPC and database URL) through data sources; it never changes them. Why, and
how the resources moved without being re-created:
[ADR 0007](docs/adr/0007-terraform.md).

**Changing infrastructure:** edit `infra/*.tf` on a branch and open a pull
request. HCP Terraform posts a plan as a check on the PR; merging to `main`
applies it. Credentials are short-lived: the workspace assumes an IAM role
through OIDC (`infra/bootstrap/`), so no AWS key is stored anywhere.

```bash
terraform login        # once, an HCP Terraform user token
make infra-init        # once
make infra-plan        # what would change; applies nothing
make infra-env         # write the outputs (COGNITO_*, REPORTS_*, PARSER_URL) to .env
```

The personal and secret inputs (`google_client_id`, `google_client_secret`,
`reports_sender`, `budget_email`) are workspace variables, not files in the
repository. Since the image is the application pipeline's business,
Terraform ignores `image_uri` on the builder and the parser.

## Deploy

Requires the AWS CLI configured for the account.

```bash
make deploy-backend    # build image, push to ECR (tag = commit SHA), roll the Lambda, migrate
make deploy-frontend   # build the static export, sync to S3, invalidate CloudFront
```

`deploy-backend` writes the API URL to `.env`; `deploy-frontend` builds against
it, so deploy the backend first.

A push to `main` runs lint, tests and then the backend deploy through GitHub
Actions (see `.github/workflows/deploy-backend.yml`). The workflow authenticates
with an IAM role through OIDC; no AWS key is stored in the repository.

To find out which commit is live:

```bash
aws lambda get-function --function-name spry-backend --query Code.ImageUri --output text
```

The tag at the end of the image URI is the commit SHA.

## Tear down

1. Sign-in, reports, parser, budget: in HCP Terraform, workspace `spry-dev` →
   **Settings → Destruction and Deletion → Queue destroy plan** (the workspace
   is VCS-driven, so a destroy from the CLI is refused). Empty the reports
   bucket first; the user pool takes every account with it.
2. The rest:

```bash
make destroy-backend
make destroy-frontend
```

Then delete the `spry-github-oidc` stack and the GitHub OIDC provider. Aurora
and the Secrets Manager secret are billed for as long as they exist.
