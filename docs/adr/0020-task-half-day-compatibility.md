# ADR-0020: Task / half-day compatibility matrix

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (explicit rule + default answers)
- **Source**: initial brief ("no intercontract task in a mission half-day"); Q-G3, Q-G7, Q-G8, Q-G9
- **Tags**: domain
- **Related**: ADR-0018, ADR-0022 · **Supersedes**: none

## Context

Tasks are placed in half-days and concern a subject. Subjects have a scope (MISSION, INTERCONTRACT, TRAINING, PERSONAL). The brief forbids intercontract tasks in mission half-days; the owner accepted the stricter default for the other combinations.

## Decision drivers

- Time accounting must be trustworthy (it feeds the monthly lock, ADR-0021)
- One rule set, enforced server-side and mirrored in the UI

## Considered options

1. **Strict matrix enforced in the service layer**
2. **Warnings only** — data becomes inconsistent
3. **DB triggers** — hard to test and to translate errors

## Decision

A task with subject scope S may be placed in a half-day of kind K only if allowed below:

| Half-day kind ↓ / Subject scope → | MISSION | INTERCONTRACT | TRAINING | PERSONAL |
|---|---|---|---|---|
| MISSION | ✅ same mission only | ❌ | ❌ | ❌ |
| INTERCONTRACT | ❌ | ✅ | ✅ | ✅ |
| TRAINING | ❌ | ❌ | ✅ | ❌ |
| LEAVE, PUBLIC_HOLIDAY, SICK_LEAVE, OFF | ❌ | ❌ | ❌ | ❌ |

- Violations return `409` with code `TASK_INCOMPATIBLE_HALF_DAY` and params `{halfDayKind, subjectScope}`.
- Changing a half-day's kind or mission is refused while it holds incompatible tasks (`HALF_DAY_HAS_INCOMPATIBLE_TASKS`), listing them.
- A task belongs to exactly one half-day; multi-day work continues through the subject ("carry over" action).
- Sum of task durations above 4 h in a half-day is a **warning** (`HALF_DAY_OVERBOOKED`), not an error.
- The matrix lives in one place: `app/modules/agenda/compatibility.py`, exported to the frontend through an endpoint so the UI never duplicates it.

## Rationale

Warnings-only would corrupt the time-per-mission figures. Triggers would scatter logic away from tested Python code.

## Consequences

- **Positive**: reliable per-mission time accounting
- **Negative**: occasional real-life exceptions (a quick fix for mission A during intercontract) are impossible to record as such
- **Follow-ups**: P5-5, P5-6, P5-7

## Compliance

Parametrised test covering all 28 cells of the matrix (`test_rg03_rg04_rg05_matrix`).
