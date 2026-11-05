# ADR-0033: Agenda macro — slot API, public holidays, completeness and rendering

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: roadmap phase P4 (tickets P4-1 to P4-16); Q-E1, Q-E3, Q-E4, Q-E5, Q-E6, Q-E8, Q-N2
- **Tags**: domain, backend, frontend
- **Related**: ADR-0018, ADR-0019, ADR-0021, ADR-0032 · **Supersedes**: none

## Context

ADR-0018 (half-day unit), ADR-0019 (location) and ADR-0021 (monthly lock) define the agenda's rules. Implementing them raised further questions: the shape of the write API for multi-day selections, how public holidays are pre-filled without fighting the user's edits, how RG-02 holds when a mission's dates change, what "complete month" means, and how the views encode kinds.

## Decision drivers

- Filling a year must take minutes: selections of dozens of half-days in one action
- Validated history must never become inconsistent (RG-02, RG-12, RG-13)
- Public holidays appear by themselves but never overwrite a deliberate change
- Kinds readable without relying on colour alone (accessibility)

## Considered options

1. **Writes**: slot-based bulk endpoints, all or nothing (chosen) vs. one request per half-day (slow, partial failures) vs. range endpoints (cannot express "Monday and Wednesday mornings").
2. **Holidays**: computed on the fly from the `holidays` library and pre-filled once per year, the year being recorded (chosen) vs. pre-filled on every load (re-adds a holiday the user changed) vs. never materialised (holidays would not count as filled half-days, nor appear in exports).
3. **RG-02 when a mission moves**: refuse the mission change while half-days would fall outside (chosen) vs. silently shrink the agenda vs. allow inconsistency.

## Decision

- **API** (`/api/v1/agenda`): `GET half-days?from&to` (≤ 400 days), `POST half-days/bulk` (same values for 1–800 slots; creates or replaces), `POST half-days/bulk-delete`, plus single `PUT`/`DELETE half-days/{date}/{period}`. A bulk write is validated as a whole and committed atomically.
- **Integrity**: unique `(owner, date, period)` (RG-01); CHECK `kind = MISSION ⇔ mission_id`; CHECK no location for absences (ADR-0019); `mission_id` FK `RESTRICT` (RG-12). The service also checks that every date lies within the mission's dates (actual end date wins over planned) and that a subtype belongs to the chosen kind.
- **Mission date changes**: `PATCH /missions/{id}` returns `409 MISSION_HAS_HALF_DAYS_OUTSIDE {count, firstDate}` if half-days would fall outside the new period.
- **Public holidays**: `holidays.country_holidays("FR", subdiv=User.holiday_subdivision)` — metropolitan France by default, `"57"` for Alsace-Moselle, overseas departments by code. `POST public-holidays/generate?year=` creates `PUBLIC_HOLIDAY` half-days (note = holiday name) on empty slots only, skips locked months, and records the year in `holiday_generations` so later calls do nothing unless `force=true`. The UI triggers it as an idempotent query that gates the agenda queries, so the first display already contains the holidays.
- **Completeness** (lock, unfilled count, stats): expected half-days are weekday AM/PM slots that are not public holidays; weekends are optional. "Unfilled" counts expected slots from the first day of the month of the user's first half-day (or account creation) until yesterday, over at most 400 days.
- **Statistics**: days = half-days / 2, by kind, mission and location; working days = expected slots / 2.
- **Subtypes**: instance-wide referential (`half_day_subtypes`), unique per kind, seeded with 12 entries (CP, RTT, sick child…), deletable only when unused.
- **Monthly lock**: as ADR-0021, with idempotent lock, `MONTH_NOT_LOCKED` on unlocking an open month, and the lock checked by one guard (`LockService.ensure_unlocked`) in every write path, holiday generation included.
- **Views**: `/agenda` → current month; `/agenda/:year` (12 mini-months, totals, legend); `/agenda/:year/:month` (grid Monday→Sunday, each day split AM/PM). Selection: click toggles, shift-click selects a chronological range, drag paints, the day number selects both halves, Enter/Space for keyboard users. Mission half-days use the mission colour; other kinds a fixed colour **and** a pattern (stripes, dots, cross-hatch…); every cell has an accessible name ("lundi 2 novembre, matin : Mission X").

## Rationale

Per-half-day writes make a two-week selection 20 requests with partial failure modes. Re-adding holidays on each load would fight the user. Shrinking the agenda behind the user's back when a mission ends earlier would silently rewrite a timesheet.

## Consequences

- **Positive**: fast bulk entry; consistent history; holidays automatic but respectful of edits; accessible encoding
- **Negative**: changing the holiday region does not rewrite an already generated year (use `force`, empty slots only); a mission's dates cannot shrink before its agenda is edited
- **Follow-ups**: P5 tasks attach to half-days (ADR-0020); P6 week templates reuse the bulk write path and the lock guard; P13 CRA export from locked months

## Compliance

`tests/unit/test_agenda_rules.py`, `tests/integration/test_agenda.py` (RG-01, RG-02, RG-11, RG-12, RG-13, isolation); frontend `agenda.test.tsx`; e2e `agenda.spec.ts`.
