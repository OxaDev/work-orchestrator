# ADR-0010: Multi-user data model, single-user usage

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-A1
- **Tags**: data
- **Related**: ADR-0009 · **Supersedes**: none

## Context

Only the owner uses the app today. Colleagues might join later. Retrofitting ownership into every table later is a heavy migration.

## Decision drivers

- Cheap now, expensive later
- Clear privacy boundary if other users join

## Considered options

1. **`owner_id` on personal data, shared referentials** from day one
2. **No user scoping** — simplest, blocks future sharing
3. **Full multi-tenancy (tenant_id everywhere)** — overkill

## Decision

- **Personal data** carries a non-null `owner_id` and is only visible to its owner: missions, half-days, tasks, subjects, daily logs, week templates, documents, architectures, domains, attachments.
- **Shared referentials** are instance-wide: sectors, companies, org units, contacts, technologies, tags, contact roles.
- Every repository query on personal data filters on the current user; this is enforced in a base repository class, not left to each query.

## Rationale

Option 2 blocks evolution; option 3 adds a concept nobody needs.

## Consequences

- **Positive**: adding a user later is a non-event
- **Negative**: every personal query carries the filter; tests must cover cross-user isolation
- **Follow-ups**: generic isolation test suite (P12-1)

## Compliance

Automated test: for each personal-data endpoint, a second user receives 404 on the first user's resources.

## Notes

- 2026-11-05 (P3): "enforced in a base repository class" is implemented as shared helpers instead (`OwnedMixin`, `owned()`, `get_owned()` in `app/shared/ownership.py`), see ADR-0032. Same guarantee, tested per module.
