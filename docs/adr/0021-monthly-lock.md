# ADR-0021: Monthly lock (timesheet-like)

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-E6 ("like a CRA")
- **Tags**: domain
- **Related**: ADR-0018, ADR-0020 · **Supersedes**: none

## Context

Consultants submit a monthly activity report (CRA) to their ESN. The owner wants a month, once validated, to be locked like a CRA. The past and the future are otherwise freely editable.

## Decision drivers

- Validated months must not change silently
- Mistakes must still be fixable, with a trace

## Considered options

1. **Explicit `MonthLock` with validation, unlock allowed with a reason, history kept**
2. **Automatic lock after N days** — surprises the user
3. **Irreversible lock** — mistakes become permanent

## Decision

- `MonthLock(owner_id, year, month, locked_at, note)`, unique on `(owner_id, year, month)`; `MonthLockEvent(owner_id, year, month, action ∈ {LOCK, UNLOCK}, reason, at)` keeps the history.
- Locking requires every weekday half-day of the month to be filled; otherwise `422 MONTH_INCOMPLETE` with the list of missing half-days. Weekends may stay empty.
- While locked, creating, updating, moving or deleting half-days and tasks in that month returns `409 MONTH_LOCKED`. Daily logs and task descriptions stay editable (notes, not time accounting).
- Unlocking needs a non-empty reason, recorded in `MonthLockEvent`.
- Bulk operations, week-template application and public-holiday generation skip locked months and report them.
- The month view shows a lock badge and a "Validate month" action with a recap (days per kind and per mission) — the base for the CRA export (P13).

## Rationale

Automatic locking would block legitimate late entries; an irreversible lock is hostile to typos.

## Consequences

- **Positive**: trustworthy history aligned with submitted CRAs
- **Negative**: every write path in the agenda must check the lock
- **Follow-ups**: moved from P13 into P4 (new tickets P4-14 to P4-16)

## Compliance

A single `ensure_month_unlocked(owner, date)` guard used by all agenda services; tests per write path (`test_month_locked_*`).
