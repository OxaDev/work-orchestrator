# ADR-0017: Mission = client + employer company

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-C1, Q-C2, Q-C6, Q-C7, Q-C8 (C6–C8 default answers)
- **Tags**: domain
- **Related**: ADR-0018 · **Supersedes**: none

## Context

The brief says "a mission is a client with a company behind it". The owner clarified: the two companies are the **client** and **the owner's own ESN** (consulting firm). No intermediary. The owner may change employer during their career.

## Decision drivers

- Keep the right employer on past missions after an employer change
- Avoid modelling subcontracting chains nobody uses

## Considered options

1. **`client_id` + `employer_company_id` on Mission, employer defaulted from a user setting**
2. **Employer only as a user setting** — history lost after a job change
3. **Client + optional intermediary chain** — not needed

## Decision

`Mission` fields: `title`, `job_title`, `client_id` (Company, required), `employer_company_id` (Company, required, pre-filled from `User.employer_company_id`, then frozen on the mission), `start_date` (required), `planned_end_date`, `actual_end_date`, `status` (PROSPECT, ACTIVE, ON_HOLD, ENDED), `location`, `remote_policy`, `objectives` (Markdown), `description` (Markdown), `review` (end-of-mission Markdown), `color`, `daily_rate` (optional, hidden by default, no financial computation in V1).

End-date extensions are kept in `MissionEndDateChange` (old date, new date, changed_at, note).

Several missions may be active at the same time, but a half-day belongs to at most one mission (ADR-0018).

`Company.types` is a set of `CLIENT`, `ESN`, `OTHER`.

## Rationale

Option 2 rewrites history on a job change. Option 3 adds complexity rejected by the owner.

## Consequences

- **Positive**: accurate history, simple model
- **Negative**: changing employer on an existing mission is a manual edit
- **Follow-ups**: P2-3, P3-1

## Compliance

Unit test: changing `User.employer_company_id` does not alter existing missions.
