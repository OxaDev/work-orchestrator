# ADR-0032: Missions — ownership enforcement, status, history and links

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: roadmap phase P3 (tickets P3-1 to P3-9); Q-C6, Q-C7, Q-C8, Q-D3, Q-J1, Q-J2, Q-J4
- **Tags**: domain, data
- **Related**: ADR-0010, ADR-0017, ADR-0018, ADR-0031 · **Supersedes**: none

## Context

Missions are the first personal data of the application and the anchor of the agenda (P4) and of architectures (P8). ADR-0017 fixes their fields; implementing them required deciding how ownership is enforced in code, how the status relates to the dates, how renewals are tracked, how contacts and technologies attach, and when a mission may be deleted.

## Decision drivers

- No user may ever read or modify another user's mission (ADR-0010)
- The status must stay trustworthy without becoming a burden
- Renewals are frequent for consultants and worth remembering
- Agenda history must never be orphaned (RG-12)

## Considered options

1. **Ownership**: shared helpers `OwnedMixin`, `owned(query)`, `get_owned(...)` used by every personal-data service (chosen) vs. a generic repository base class (more indirection for little gain at this size) vs. PostgreSQL row-level security (strong, but needs a DB role per request and complicates tests).
2. **Status**: manual status plus a computed `suggested_status` (chosen) vs. fully derived from dates (cannot express PROSPECT or ON_HOLD) vs. manual only (drifts silently).
3. **Deletion**: hard delete allowed until something references the mission, enforced by `RESTRICT` foreign keys (chosen) vs. archive only (clutters the list with test entries) vs. cascade (would erase agenda history).

## Decision

- **Ownership** (`app/shared/ownership.py`): personal tables mix in `OwnedMixin` (`owner_id`, FK users, `ON DELETE CASCADE`). Services build queries with `owned(...)` and load rows with `get_owned(...)`, which returns `404 NOT_FOUND {entity}` for a foreign row (never 403). An integration test asserts 404 on every mission operation for a second user.
- **Employer**: `employer_company_id` defaults to the user's ESN; if neither is given, `422 MISSION_EMPLOYER_REQUIRED`.
- **Dates**: end dates (planned, actual) must not precede the start date — validated by the service (`INVALID_DATE_RANGE`) and by CHECK constraints.
- **Status**: stored and edited manually (`PROSPECT`, `ACTIVE`, `ON_HOLD`, `ENDED`). The API exposes `suggested_status` when the dates disagree: `ENDED` once the effective end (actual, else planned) is past, `ACTIVE` once started; never for `ON_HOLD`, never for future missions. The UI offers a one-click "apply".
- **Renewals**: every change of `planned_end_date` appends a `mission_end_date_changes` row (old, new, when, optional note from `end_date_change_note`).
- **Colour**: one of 12 Mantine palette colours; when omitted, the least-used colour among the owner's active missions is picked.
- **Contacts**: `mission_contacts` links a contact once per mission with an optional role from `contact_roles`, an instance-wide FR/EN referential seeded with 8 roles and editable (Directory → Roles); a used role cannot be deleted.
- **Technologies**: `mission_technologies` with `weight` 1–5 (CHECK), optional `version` and note (Q-J1, Q-J4). Weights are manual for now; the computed suggestion (Q-J2) comes with domains (P10-2).
- **Links API**: idempotent `PUT /missions/{id}/contacts/{contact_id}` and `PUT /missions/{id}/technologies/{technology_id}` (create or update), `DELETE` to unlink; every mission write returns the full detail.
- **Deletion**: `DELETE /missions/{id}` performs a hard delete; any future table referencing missions (half-days, architectures…) must use `ON DELETE RESTRICT`, so the database refuses and the API answers `409 ENTITY_REFERENCED` — the user archives instead (RG-12).
- **Daily rate**: optional, hidden in the UI behind a "show financial data" switch; no computation (Q-C7).

## Rationale

Row-level security is the strongest option but would leak into every test and connection; explicit helpers plus an isolation test give the same guarantee at this scale. A derived status cannot represent intent (prospect, pause); a purely manual one goes stale — the suggestion keeps the human in control.

## Consequences

- **Positive**: one ownership pattern for all future personal data (agenda, documents, architectures); renewals traceable; deletion safe by construction
- **Negative**: ownership depends on services always using the helpers (reviewed and tested, not enforced by the database); `RESTRICT` must be remembered on every future reference to missions
- **Follow-ups**: P4 half-days reference missions with `RESTRICT`; P10-2 weight suggestion

## Compliance

`tests/integration/test_missions.py` (including `test_missions_are_private_to_their_owner`), `tests/unit/test_mission_rules.py`; frontend `missions.test.tsx`; e2e `missions.spec.ts`.
