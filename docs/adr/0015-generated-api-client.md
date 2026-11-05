# ADR-0015: Typed API client generated from OpenAPI

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default)
- **Source**: scoping document §7.2
- **Tags**: frontend
- **Related**: ADR-0005, ADR-0014 · **Supersedes**: none

## Context

FastAPI generates an OpenAPI schema from Pydantic models. Hand-written TypeScript types would drift from it.

## Decision drivers

- Single source of truth for the contract
- Lightweight runtime

## Considered options

1. **`openapi-typescript` (types) + `openapi-fetch` (typed fetch)**
2. **`orval`** — generates TanStack Query hooks; more generated code to read
3. **Hand-written types** — drift

## Decision

`make api-client` exports the backend OpenAPI schema and generates `frontend/src/api/schema.d.ts` with `openapi-typescript`. All calls go through one `openapi-fetch` client configured with the base path (ADR-0011) and `credentials: "include"`. TanStack Query hooks are written by hand per feature on top of it. The generated file is committed.

## Rationale

Orval's generated hooks are harder to customise (invalidation, optimistic updates) and add bulk.

## Consequences

- **Positive**: type errors when the backend contract changes
- **Negative**: one manual step (`make api-client`) after backend schema changes
- **Follow-ups**: CI check that the committed schema is up to date

## Compliance

`make lint` regenerates the client and fails if `git diff` is non-empty on `schema.d.ts`.
