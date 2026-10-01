# Architecture decisions

Each decision states what was chosen, why, and what it costs.

## 1. One repository (monorepo)

Backend, frontend, infrastructure and CI live in one repository.

- **Atomic changes.** One commit changes the API and the client that calls it,
  so they cannot drift apart.
- **The repository is the context window.** With the whole pipeline in one
  tree, an agent (or a reviewer) can read the endpoint, the model, the
  migration and the component that renders it in one pass. Split across three
  repositories it would see a third of the system and guess the rest, and a
  guessed contract is a bug found at integration time.
- **Trade-off.** A boundary buys independence and costs context. For a team of
  four and a product that does not exist yet, context is worth more.

## 2. Frontend: static export on S3 behind CloudFront

The Next.js app is built with `output: "export"` and served from a private S3
bucket through CloudFront.

- No server to run or patch; CloudFront terminates HTTPS and caches at the edge.
- Hashed assets are cached for a year (`immutable`), everything else is not
  cached, and every deploy invalidates the CDN cache, so visitors never keep an
  old bundle.
- **Trade-off.** No server-side rendering. The page is a client-side list and
  form, so nothing is lost. Next.js was kept instead of Vite because the
  repository started from the course template.

## 3. Backend: Lambda container image with a function URL

The API runs as a container image on Lambda (arm64) and is reached through a
function URL.

- It gives HTTPS on an AWS hostname without a custom domain, which was not
  required. An ALB would need either a certificate on a domain or an extra
  CloudFront layer to be reachable from an HTTPS page, because browsers block
  HTTPS pages from calling plain HTTP.
- Nothing runs, or is billed, between requests.
- **Trade-offs.** Cold starts, and Aurora Serverless pauses to zero when idle, so
  the first request after a quiet period takes about 15 seconds. ECS on Fargate
  behind an ALB would keep a warm container and allow several replicas with a
  health-checked target group; that is the better fit once there is steady
  traffic and a domain.

## 4. Database: Aurora Serverless v2, private

PostgreSQL 17 locally and Aurora PostgreSQL 17.4 on AWS, so behaviour matches.

- Not publicly accessible; its security group accepts connections from the
  function only.
- Schema changes go through Alembic revisions, never `create_all()`: a running
  product holds data, and a migration is a versioned, reviewable change to a
  schema that already has rows. The deploy script applies migrations after each
  deploy by invoking the function with `{"action": "migrate"}`, a call that only
  someone allowed to run `lambda:Invoke` can make.

## 5. Images are tagged with the commit SHA

Never `latest`. The tag tells exactly which commit is running, and a rollback is
"deploy the previous tag" instead of archaeology.

## 6. GitHub OIDC instead of stored AWS keys

A pasted access key is permanent, works from anywhere and is readable by anyone
who can read the repository secrets or add a workflow.

- GitHub issues a signed token for each run describing the repository and
  branch. AWS trusts GitHub's OIDC provider and lets that token assume a role
  (`sts:AssumeRoleWithWebIdentity`) for one subject only.
- The trust policy requires `aud = sts.amazonaws.com` and
  `sub = repo:oliavaranytsa@270393240/spry@1397346708:ref:refs/heads/main`.
  New repositories use GitHub's immutable subject format, which embeds the
  numeric owner and repository IDs, so a renamed or recycled name cannot
  impersonate this repository.
- If the condition matched any repository, the AWS account would be granted to
  all of GitHub; matching one repository and one branch means pull requests and
  forks cannot deploy.
- Credentials are temporary and expire with the job. The role is limited to the
  services the deploy touches and to `spry-*` resources, not `AdministratorAccess`.

## 7. No custom domain

Agreed with the lecturer. Both services are reachable over HTTPS on the default
AWS hostnames. Adding a domain would add an ACM certificate, DNS validation and a
CloudFront alias (the scripts for the frontend already exist).

## Known gaps and next steps

- CORS is open to all origins; it should be narrowed to the CloudFront origin.
- The frontend is deployed with `make deploy-frontend`; CI only deploys the backend.
- The router is mounted both with and without the `/api` prefix; only
  `/api/meetings` is part of the contract.
- A staging environment and a rollback workflow (redeploy a given SHA) are not set up.
