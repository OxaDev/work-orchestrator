# ADR-0016: Testing strategy and blocking coverage thresholds

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answer)
- **Source**: initial brief ("automatic test coverage"); Q-M4, Q-M5
- **Tags**: quality
- **Related**: ADR-0003, ADR-0004 · **Supersedes**: none

## Context

The brief requires automated test coverage. Much of the code is written by agents, so tests are the main safety net.

## Decision drivers

- Business rules (RG-xx) must never regress
- Tests close to production (real PostgreSQL)
- Fast enough to run on every change

## Considered options

1. **Pyramid: unit (services) + integration (API on real Postgres) + a few E2E; blocking thresholds**
2. **Mostly E2E** — slow, flaky
3. **No thresholds** — coverage erodes

## Decision

- Backend: `pytest`, `pytest-asyncio`, `httpx.AsyncClient`, `factory-boy`. Integration tests on a dedicated PostgreSQL test database, each test in a rolled-back transaction. Coverage **≥ 85 %**, blocking.
- Frontend: Vitest + Testing Library + MSW. Coverage **≥ 70 %**, blocking.
- E2E: Playwright on critical journeys, run by `make test-e2e` (not part of the default `make test`), including one run under `BASE_PATH=/work-orchestrator`.
- Every business rule RG-xx has at least one named test (`test_rg03_...`).
- Migrations: `upgrade head → downgrade base → upgrade head` test.
- Git repository from P0; GitHub Actions workflow prepared but optional.

## Rationale

E2E-heavy suites are slow and brittle; no threshold lets coverage drift with agent-written code.

## Consequences

- **Positive**: regressions caught early, rules documented by tests
- **Negative**: test DB setup cost; thresholds may push low-value tests
- **Follow-ups**: P0-12, P0-18

## Compliance

`make test` fails below thresholds (`--cov-fail-under=85`, Vitest `thresholds`).
