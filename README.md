# Work Orchestrator

Personal tool for a consultant developer: a half-day agenda of missions, subjects and tasks, plus Markdown documentation of client technical architectures as a graph, exportable to Mermaid.

- Scope and domain model: [docs/00-CADRAGE.md](docs/00-CADRAGE.md) (French)
- Roadmap: [docs/02-ROADMAP.md](docs/02-ROADMAP.md)
- Architecture decisions: [docs/adr/](docs/adr/README.md)
- Operations (reverse proxy, ports, backups): [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Stack

FastAPI · SQLAlchemy 2 (async) · Alembic · PostgreSQL 17 · uv — React 19 · TypeScript · Vite · Mantine · TanStack Query · react-i18next — Docker Compose · Makefile.

## Requirements

- Docker (Desktop) with Compose v2
- [uv](https://docs.astral.sh/uv/) (Python 3.13 is fetched by uv if missing)
- Node.js 22 (`.nvmrc`)
- GNU Make, Python 3 (for `scripts/`)

## Quick start

```bash
make init        # .env with generated secrets, dependencies, git hooks, dev database + migrations
make dev         # backend http://127.0.0.1:8000, frontend http://127.0.0.1:5173/work-orchestrator/
make test        # backend (pytest + PostgreSQL) and frontend (Vitest) with coverage thresholds
make deploy      # production-like Docker stack on http://127.0.0.1:18080/work-orchestrator/
```

`make help` lists every target.

## Layout

```
backend/    FastAPI app (app/core, app/modules/<module>, app/shared), Alembic, tests
frontend/   React SPA (src/app, src/features/<feature>, src/api, src/i18n), Vitest, Playwright (e2e/)
docs/       scoping, roadmap, ADRs, operations
scripts/    env.py (make env), adr.py (make adr-new / adr-check)
```

## Conventions

English code and comments; EN/FR interface. Every structuring decision is an ADR (`make adr-new t="..."`), see [CLAUDE.md](CLAUDE.md).
