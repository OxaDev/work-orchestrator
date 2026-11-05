# ADR-0012: Docker Compose deployment, Makefile as entry point

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: initial brief; Q-M6, Q-M7, Q-M8 (default answers)
- **Tags**: deployment
- **Related**: ADR-0011 · **Supersedes**: none

## Context

The brief requires one Dockerfile for the backend, one for the frontend, Docker Compose deployment, local hosting only, and a Makefile with `test`, `deploy`, `env`, `init`, etc.

## Decision drivers

- One command per operation, discoverable with `make help`
- Reproducible on a fresh macOS (Apple Silicon) machine
- Database not exposed

## Considered options

1. **Compose with `db`, `backend`, `frontend` services; Makefile wraps everything**
2. **Single container with supervisord** — contradicts "one Dockerfile each"
3. **Scripts in `scripts/` without Makefile** — contradicts the brief

## Decision

- Services: `db` (postgres:17, no published port), `backend` (FastAPI, internal only), `frontend` (nginx serving the SPA and proxying `/api`, published on `127.0.0.1:${APP_PORT:-8080}`).
- Volumes: `pgdata`, `uploads`; backups to `./backups` on the host.
- `docker-compose.override.yml` for development (bind mounts, hot reload, backend reachable on `127.0.0.1:8000`).
- Development: `uv` and Node 22 installed on the host; production: Docker only.
- Makefile is the single entry point: `help env init dev deploy down logs ps test test-back test-front test-e2e coverage lint format typecheck migrate migration seed backup restore api-client create-admin reset-password adr-new clean`.
- Backups: manual `make backup`, optional daily backup service, retention 30 days.

## Rationale

Option 2 and 3 contradict the brief and complicate logs and restarts.

## Consequences

- **Positive**: one-command setup and deploy; DB isolated
- **Negative**: Docker Desktop required on macOS; build times for the front image
- **Follow-ups**: P0-20 to P0-22, P11-8

## Compliance

`make help` lists all targets; P0 definition of done: `make init && make test && make deploy` on a clean machine.

## Notes

- 2026-11-05 (P0): development overlay and default ports detailed in ADR-0029 (app 18080, dev database 55432). The frontend image uses `nginxinc/nginx-unprivileged`, listening on 8080 inside the container.
