# ADR-0002: Modular monolith backend + SPA frontend

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: initial brief (constraints: FastAPI back, React front, one Dockerfile each)
- **Tags**: architecture
- **Related**: ADR-0004, ADR-0005, ADR-0012 · **Supersedes**: none

## Context

The application is a suite of linked sub-apps (Agenda, Architecture, Documents, Directory) sharing entities such as Mission and Contact. One user, local hosting. The brief imposes a FastAPI backend and a React frontend, each with its own Dockerfile.

## Decision drivers

- Sub-apps are strongly linked (agenda → mission → architecture)
- Single developer, single user: operational simplicity wins
- Clear boundaries so modules stay understandable

## Considered options

1. **One backend process organised in modules + one SPA** — modular monolith
2. **One service per sub-app** — microservices
3. **Server-rendered pages** — conflicts with the React constraint

## Decision

We will build one FastAPI application organised in modules under `backend/app/modules/<module>/` (`models`, `schemas`, `repository`, `service`, `router`), and one React single-page application organised by feature under `frontend/src/features/<feature>/`. Modules call each other only through their `service` layer, never through another module's repository or tables directly.

Modules: `auth`, `directory` (sectors, companies, org units, contacts), `missions`, `technologies`, `agenda`, `architecture`, `documents`, `search`.

## Rationale

Microservices would require cross-service joins for every mission dashboard and multiply containers for no scaling benefit.

## Consequences

- **Positive**: single database transaction across sub-apps; simple deployment
- **Negative**: module discipline relies on review, not on process boundaries
- **Follow-ups**: consider an import-linter contract in P12 to enforce module boundaries

## Compliance

Code review; optional `import-linter` rule forbidding `app.modules.X.repository` imports from `app.modules.Y`.
