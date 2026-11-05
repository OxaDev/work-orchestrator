# ADR-0004: Backend stack — FastAPI, SQLAlchemy 2 async, Alembic, uv

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: initial brief (technical constraints)
- **Tags**: backend
- **Related**: ADR-0003, ADR-0014, ADR-0016 · **Supersedes**: none

## Context

The brief imposes FastAPI, Alembic, SQLAlchemy, `pyproject.toml` and `uv`. Remaining choices: sync or async ORM, driver, validation and settings libraries, quality tooling.

## Decision drivers

- Consistency with FastAPI's async model
- Strong typing end to end
- Fast, reproducible dependency management

## Considered options

1. **SQLAlchemy 2 async + asyncpg** — native async, typed `Mapped[]` models
2. **SQLAlchemy 2 sync + psycopg** — simpler, blocks the event loop or needs threadpool
3. **SQLModel** — less boilerplate, lags behind SQLAlchemy features

## Decision

We will use:

- Python 3.13, FastAPI, uvicorn
- SQLAlchemy 2.x **async** with `asyncpg`, typed declarative models
- Alembic with async env, constraint naming convention, one migration per change
- Pydantic v2 for schemas, `pydantic-settings` for configuration from environment
- `uv` with `pyproject.toml` and committed `uv.lock`
- `ruff` (lint + format), `mypy --strict`

## Rationale

Sync SQLAlchemy would waste FastAPI's async model. SQLModel adds an abstraction layer that complicates advanced mappings (polymorphic links, recursive CTEs).

## Consequences

- **Positive**: typed models and schemas, good performance, modern tooling
- **Negative**: async SQLAlchemy has pitfalls (lazy loading forbidden: explicit `selectinload` needed)
- **Follow-ups**: set `lazy="raise"` on relationships to surface accidental lazy loads

## Compliance

`backend/pyproject.toml` dependencies; `mypy --strict` and `ruff` run in `make lint`.
