# Work Orchestrator — single entry point for every operation (ADR-0012). Run `make help`.

SHELL := /bin/bash
.DEFAULT_GOAL := help

UV          ?= uv
NPM         ?= npm
COMPOSE     := docker compose
# Separate Compose project: dev data never mixes with the deployed stack's volumes (ADR-0029).
COMPOSE_DEV := docker compose -p work-orchestrator-dev -f docker-compose.yml -f docker-compose.dev.yml
BACK        := cd backend &&
FRONT       := cd frontend &&

##@ Setup

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

.PHONY: env
env: ## Create .env from .env.example with generated secrets (keeps existing values)
	@python3 scripts/env.py

.PHONY: init
init: env ## Install every dependency, git hooks, start the dev database and migrate it
	$(BACK) $(UV) sync
	$(FRONT) $(NPM) ci
	if [ -d .git ]; then backend/.venv/bin/pre-commit install; fi
	$(MAKE) migrate
	$(BACK) $(UV) run python -m app.cli seed-reference
	$(BACK) $(UV) run python -m app.cli create-admin --skip-if-exists
	@echo "Done. Next: 'make dev' (development) or 'make deploy' (Docker stack)."

##@ Development

.PHONY: db-up
db-up: env ## Start the development database (127.0.0.1:$POSTGRES_PORT)
	$(COMPOSE_DEV) up -d --wait db

.PHONY: dev
dev: db-up ## Run backend (:8000) and frontend (:5173) with hot reload
	trap 'kill 0' INT TERM EXIT; \
	($(BACK) $(UV) run uvicorn app.main:app --reload --port 8000) & \
	($(FRONT) $(NPM) run dev) & \
	wait

.PHONY: dev-back
dev-back: db-up ## Run only the backend with hot reload
	$(BACK) $(UV) run uvicorn app.main:app --reload --port 8000

.PHONY: dev-front
dev-front: ## Run only the frontend dev server
	$(FRONT) $(NPM) run dev

.PHONY: migrate
migrate: db-up ## Apply database migrations (development database)
	$(BACK) $(UV) run alembic upgrade head

.PHONY: migration
migration: db-up ## Create a migration: make migration m="add missions table"
	@test -n "$(m)" || (echo 'Usage: make migration m="message"' && exit 1)
	$(BACK) $(UV) run alembic revision --autogenerate -m "$(m)"

.PHONY: api-client
api-client: ## Regenerate the typed API client from the backend OpenAPI schema (ADR-0015)
	$(BACK) $(UV) run python -m app.cli openapi > ../frontend/openapi.json
	$(FRONT) $(NPM) run api:types

.PHONY: seed
seed: migrate ## Load reference data and fictional demo data into the development database
	$(BACK) $(UV) run python -m app.cli seed-demo

.PHONY: create-admin-dev
create-admin-dev: db-up ## Create an administrator in the development database
	$(BACK) $(UV) run python -m app.cli create-admin

.PHONY: reset-password-dev
reset-password-dev: db-up ## Reset a password in the development database: make reset-password-dev email=...
	@test -n "$(email)" || (echo 'Usage: make reset-password-dev email=you@example.com' && exit 1)
	$(BACK) $(UV) run python -m app.cli reset-password --email "$(email)"

.PHONY: dev-down
dev-down: ## Stop the development database (data kept)
	$(COMPOSE_DEV) down

##@ Quality

.PHONY: test
test: test-back test-front ## Run backend and frontend test suites with coverage thresholds

.PHONY: test-back
test-back: db-up ## Backend tests (pytest, real PostgreSQL, coverage >= 85 %)
	$(BACK) $(UV) run pytest --cov --cov-report=term-missing

.PHONY: test-front
test-front: ## Frontend tests (Vitest, coverage >= 70 %)
	$(FRONT) $(NPM) run test:coverage

.PHONY: e2e-install
e2e-install: ## Download the Playwright browser (once)
	$(FRONT) npx playwright install chromium

# Dedicated, isolated stack for end-to-end tests: never touches the deployed data.
E2E_COMPOSE   := docker compose -p work-orchestrator-e2e
E2E_PORT      ?= 18081
E2E_BASE_PATH ?= /work-orchestrator
E2E_EMAIL     := e2e-admin@example.com
E2E_PASSWORD  := E2e-Admin-Pass-1

.PHONY: test-e2e
test-e2e: env ## End-to-end tests (Playwright) on an isolated Docker stack (port $(E2E_PORT))
	APP_PORT=$(E2E_PORT) BASE_PATH=$(E2E_BASE_PATH) $(E2E_COMPOSE) up -d --build --wait
	$(E2E_COMPOSE) exec -T backend alembic upgrade head
	$(E2E_COMPOSE) exec -T backend python -m app.cli seed-reference
	$(E2E_COMPOSE) exec -T -e WO_PASSWORD=$(E2E_PASSWORD) backend \
		python -m app.cli create-admin --email $(E2E_EMAIL) --display-name "E2E Admin" --skip-if-exists
	$(FRONT) E2E_EMAIL=$(E2E_EMAIL) E2E_PASSWORD=$(E2E_PASSWORD) \
		E2E_BASE_URL=http://127.0.0.1:$(E2E_PORT)$(E2E_BASE_PATH)/ $(NPM) run e2e

.PHONY: e2e-down
e2e-down: ## Stop the end-to-end test stack
	$(E2E_COMPOSE) down

.PHONY: coverage
coverage: db-up ## HTML coverage reports (backend/htmlcov, frontend/coverage)
	$(BACK) $(UV) run pytest --cov --cov-report=html
	$(FRONT) $(NPM) run test:coverage

.PHONY: lint
lint: adr-check ## Lint backend, frontend, ADRs and check the API client is up to date
	$(BACK) $(UV) run ruff check . && $(UV) run ruff format --check .
	$(FRONT) $(NPM) run lint && $(NPM) run format:check
	$(MAKE) api-client-check

.PHONY: format
format: ## Auto-format backend and frontend
	$(BACK) $(UV) run ruff check --fix . && $(UV) run ruff format .
	$(FRONT) $(NPM) run format

.PHONY: typecheck
typecheck: ## Static type checks (mypy --strict, tsc)
	$(BACK) $(UV) run mypy app tests
	$(FRONT) $(NPM) run typecheck

.PHONY: api-client-check
api-client-check: ## Fail if the committed API client differs from the backend schema
	$(MAKE) api-client
	git diff --exit-code -- frontend/openapi.json frontend/src/api/schema.d.ts

##@ ADR

.PHONY: adr-new
adr-new: ## Create a new ADR: make adr-new t="Use SSE for live refresh"
	@test -n "$(t)" || (echo 'Usage: make adr-new t="Title"' && exit 1)
	python3 scripts/adr.py new "$(t)"

.PHONY: adr-check
adr-check: ## Validate ADR files against the index
	python3 scripts/adr.py check

##@ Deployment

.PHONY: deploy
deploy: env ## Build and start the Docker stack, then apply migrations
	$(COMPOSE) up -d --build --wait
	$(COMPOSE) exec -T backend alembic upgrade head
	$(COMPOSE) exec -T backend python -m app.cli seed-reference
	$(COMPOSE) exec backend python -m app.cli create-admin --skip-if-exists
	@source .env; echo "Up: http://127.0.0.1:$${APP_PORT:-18080}$${BASE_PATH}/"

.PHONY: down
down: ## Stop the Docker stack (data volumes are kept)
	$(COMPOSE) down

.PHONY: create-admin
create-admin: ## Create an administrator in the deployed stack
	$(COMPOSE) exec backend python -m app.cli create-admin

.PHONY: reset-password
reset-password: ## Reset a password in the deployed stack: make reset-password email=...
	@test -n "$(email)" || (echo 'Usage: make reset-password email=you@example.com' && exit 1)
	$(COMPOSE) exec backend python -m app.cli reset-password --email "$(email)"

.PHONY: logs
logs: ## Follow the Docker stack logs
	$(COMPOSE) logs -f --tail=100

.PHONY: ps
ps: ## Show the Docker stack status
	$(COMPOSE) ps

.PHONY: clean
clean: ## Remove caches and build artefacts (not data volumes)
	rm -rf backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache backend/htmlcov backend/.coverage
	rm -rf frontend/dist frontend/coverage frontend/playwright-report frontend/test-results
