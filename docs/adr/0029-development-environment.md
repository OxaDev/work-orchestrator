# ADR-0029: Development environment — host processes, dockerized database

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: roadmap ticket P0-21
- **Tags**: deployment, process
- **Related**: ADR-0003, ADR-0011, ADR-0012, ADR-0016 · **Supersedes**: none

## Context

ADR-0012 fixes the production-like stack. Development needs hot reload, a database reachable by tests run on the host, and must never leak dev settings (published database port) into `make deploy`. Common ports (5432, 5433, 8080) are already used by other projects on the owner's machine.

## Decision drivers

- Fast feedback (hot reload, tests in seconds)
- `make deploy` must stay identical to production
- No port clash with other local projects

## Considered options

1. **Backend and frontend on the host (uv, Vite), only PostgreSQL in Docker via an explicit dev overlay file**
2. **Everything in Docker with bind mounts (`docker-compose.override.yml`)** — slower reload on macOS; the override file is loaded implicitly, including by `make deploy`
3. **Local PostgreSQL installed with Homebrew** — version drift, not reproducible

## Decision

- Three Compose projects built from the same files, each with its own containers and volumes so data never mixes:
  - `work-orchestrator` — the deployed stack (`make deploy`), real data;
  - `work-orchestrator-dev` — development database only, through the explicit overlay `docker-compose.dev.yml` (never auto-loaded) that publishes it on `127.0.0.1:${POSTGRES_PORT}`, default **55432**. Used by `make db-up`, `make dev`, `make migrate`, `make test-back`;
  - `work-orchestrator-e2e` — full stack for `make test-e2e` on `127.0.0.1:18081`, with a dedicated test administrator.
- `make dev` runs uvicorn (`--reload`, port 8000) and Vite (port 5173) on the host. Vite proxies `BASE_PATH/api` to the backend, stripping the prefix exactly like the production nginx, so dev URLs equal production URLs.
- Backend tests use a separate database `<POSTGRES_DB>_test` on the same server, created on demand and migrated with Alembic at session start; each test is rolled back.
- Default published application port: **18080**.
- Migrations are applied explicitly (`make migrate`, and by `make deploy` after the containers are healthy), never at container start.

## Rationale

Option 2 is slower and risks exposing the dev database in production through the implicit override. Option 3 is not reproducible.

## Consequences

- **Positive**: instant reload; tests on real PostgreSQL; deploy unaffected by dev settings
- **Negative**: uv and Node must be installed on the host; two ways to run the app to keep consistent (Vite proxy vs nginx)
- **Follow-ups**: none

## Compliance

`docker-compose.yml` publishes no database port; `make deploy` never references `docker-compose.dev.yml`; dev and e2e targets always pass their own `-p` project name.
