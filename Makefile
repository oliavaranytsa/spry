COMPOSE := docker compose

.PHONY: help up down build logs ps migrate revision test test-backend test-frontend lint fmt clean shell-backend shell-db deploy-cognito destroy-cognito deploy-backend destroy-backend logs-backend migrate-backend cert domain deploy-frontend destroy-frontend github-role deploy-reports destroy-reports report-now logs-reports llm-hello parse deploy-ai destroy-ai logs-ai

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the whole stack (detached)
	$(COMPOSE) up -d --build

down: ## Stop the stack
	$(COMPOSE) down

clean: ## Stop the stack and wipe the database volume
	$(COMPOSE) down -v

build: ## Rebuild images
	$(COMPOSE) build

logs: ## Tail all logs
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

migrate: ## Apply migrations
	$(COMPOSE) exec backend alembic upgrade head

revision: ## Autogenerate a migration: make revision m="add x"
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(m)"

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	$(COMPOSE) exec backend pytest

test-frontend: ## Run frontend tests
	$(COMPOSE) exec frontend pnpm test

lint: ## Lint both sides
	$(COMPOSE) exec backend ruff check .
	$(COMPOSE) exec frontend pnpm lint

fmt: ## Format both sides
	$(COMPOSE) exec backend ruff format .
	$(COMPOSE) exec frontend pnpm format

shell-backend: ## Shell into the backend container
	$(COMPOSE) exec backend bash

shell-db: ## psql into the database
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-peach} -d $${POSTGRES_DB:-peach}

deploy-cognito: ## Create/update the Cognito user pool; writes COGNITO_* to .env and prints them
	./scripts/deploy-cognito.sh

destroy-cognito: ## Delete the Cognito stack, every account in the pool included
	./scripts/destroy-cognito.sh

deploy-backend: ## Build + push the image, roll the Lambda (function URL + Aurora), migrate, write BACKEND_URL to .env
	./scripts/deploy-backend.sh

destroy-backend: ## Delete the backend stack, Aurora cluster included
	./scripts/destroy-backend.sh

logs-backend: ## Tail the deployed backend's CloudWatch logs
	aws logs tail /aws/lambda/$${PROJECT_NAME:-peach}-backend --follow --since 10m

migrate-backend: ## Re-run migrations on the deployed backend (deploy-backend already does)
	set -a; . ./.env; set +a; aws lambda invoke --function-name $${PROJECT_NAME:-peach}-backend \
		--cli-binary-format raw-in-base64-out --payload '{"action":"migrate"}' /dev/stdout

cert: ## Request + DNS-validate a us-east-1 certificate for the frontend: make cert DOMAIN=app.example.com
	./scripts/domain-frontend.sh cert

domain: ## Assign a custom domain to the frontend: make domain DOMAIN=app.example.com
	./scripts/domain-frontend.sh domain

deploy-frontend: ## Build the static export against BACKEND_URL and ship it to S3 + CloudFront
	./scripts/deploy-frontend.sh

destroy-frontend: ## Delete the frontend stack (bucket + distribution)
	./scripts/destroy-frontend.sh

github-role: ## Create the IAM role GitHub Actions assumes to deploy (OIDC, no keys)
	./scripts/github-role.sh

deploy-reports: ## Weekly report: queue, schedule, builder + mailer Lambdas, bucket, SES (after deploy-backend)
	./scripts/deploy-reports.sh

destroy-reports: ## Delete the report stack, the reports bucket included
	./scripts/destroy-reports.sh

report-now: ## Build a report on demand through the queue: make report-now WEEK=2026-W39
	./scripts/report-now.sh

logs-reports: ## Which event started each report run, from CloudWatch: SINCE=24h make logs-reports
	./scripts/logs-reports.sh

llm-hello: ## First call to Claude on Bedrock: prints the answer, stop_reason and usage
	./scripts/llm.sh app.ai.hello

parse: ## Run the agenda parser locally: make parse TEXT="..." or make parse FILE=docs/lab6/inputs/1-uk.txt
	@if [ -n "$(FILE)" ]; then ./scripts/llm.sh app.ai.agenda < "$(FILE)"; \
	elif [ -n "$(TEXT)" ]; then ./scripts/llm.sh app.ai.agenda "$(TEXT)"; \
	else echo 'usage: make parse TEXT="..." or make parse FILE=path'; exit 1; fi

deploy-ai: ## Agenda parser Lambda + function URL + $5 budget alarm (after deploy-backend); writes PARSER_URL
	./scripts/deploy-ai.sh

destroy-ai: ## Delete the agenda-parser stack
	./scripts/destroy-ai.sh

logs-ai: ## The parser's JSON log lines (one per parse): SINCE=24h make logs-ai
	./scripts/logs-ai.sh
