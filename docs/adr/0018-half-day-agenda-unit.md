# ADR-0018: Half-day as the agenda's atomic unit

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: initial brief ("granularity at most half a day"); Q-C8, Q-E1, Q-E2, Q-E3, Q-E4, Q-E7, Q-E8
- **Tags**: domain
- **Related**: ADR-0019, ADR-0020, ADR-0021 · **Supersedes**: none

## Context

The macro agenda shows, per half-day, whether the owner was on mission, between missions, in training, on leave, etc. Tasks (micro view) live inside half-days.

## Decision drivers

- Granularity fixed at half-day by the brief
- Fast year view (730 cells)
- Extensible leave types without schema changes

## Considered options

1. **One row per (owner, date, period) with a system `kind` + user-defined `subtype`**
2. **Free time ranges (start/end datetimes)** — finer than needed, harder to aggregate
3. **Fully user-defined kinds** — rules (ADR-0020) cannot rely on them

## Decision

- `HalfDay(owner_id, date, period ∈ {AM, PM}, kind, subtype_id?, mission_id?, location?, note)`, unique on `(owner_id, date, period)`.
- System `kind` enum: `MISSION`, `INTERCONTRACT`, `TRAINING`, `LEAVE`, `PUBLIC_HOLIDAY`, `SICK_LEAVE`, `OFF`.
- `HalfDaySubtype(kind, label_en, label_fr)` is user-editable (e.g. LEAVE → CP, RTT, unpaid leave).
- `mission_id` required iff `kind = MISSION`; the date must fall within the mission's dates.
- Kind reflects **who pays for the time**: ESN-funded training = TRAINING; client-provided training = MISSION.
- No planned/actual distinction on half-days (single value); planned vs done is tracked on tasks.
- Weekends shown greyed and editable. French public holidays (metropolitan by default, region configurable) pre-filled with the `holidays` library, idempotently.
- Empty past weekday half-days are reported as "not filled".

## Rationale

Time ranges complicate the macro view without serving any stated need; fully custom kinds would make validation rules unenforceable.

## Consequences

- **Positive**: simple aggregation (days per kind, per mission), fast queries
- **Negative**: a 2-hour absence cannot be represented
- **Follow-ups**: P4-1 to P4-5

## Compliance

Tests `test_rg01_*`, `test_rg02_*`; DB unique constraint and check constraint (`kind = 'MISSION'` ⇔ `mission_id IS NOT NULL`).
