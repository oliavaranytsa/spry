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

```bash
make destroy-backend
make destroy-frontend
```

Then delete the `spry-github-oidc` stack and the GitHub OIDC provider. Aurora
and the Secrets Manager secret are billed for as long as they exist.
