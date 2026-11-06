# ADR-0035: Week templates — model, application plan and write path

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P6 (tickets P6-1 to P6-8); Q-F1 to Q-F4; RG-10
- **Tags**: domain, backend, frontend
- **Related**: ADR-0010, ADR-0019, ADR-0021, ADR-0033, ADR-0034 · **Supersedes**: none

## Context

A week template describes the kind, mission and place of work of each half-day of a typical week
(Q-F1) and is applied by hand on a date range with a preview (Q-F2); filled half-days are kept
unless the user asks to overwrite them (Q-F4, RG-10). Other ADRs add constraints: locked months are
skipped and reported (ADR-0021), the bulk write path and lock guard are reused (ADR-0033), tasks
must stay compatible with their half-day (ADR-0034), and a mission half-day must lie inside the
mission period (RG-02). Templates hold different values per slot, while the P4 bulk write gives the
same values to every slot.

## Decision drivers

- A month of "3 days on site, 2 remote" in 3 clicks (P6 DoD)
- What the preview shows is exactly what the application does
- No partial application, no rule bypassed

## Considered options

1. **Mission of MISSION slots**: slot mission, else the mission given at application, else the template's default mission (chosen) vs. a mission stored on every slot (one template per mission, duplicated by hand).
2. **Preview and application**: one planner computing an action per half-day, applied atomically (chosen) vs. a preview endpoint and an apply endpoint with separate logic (can disagree).
3. **Write path**: generalise `HalfDayService` to per-slot values, shared by bulk assignment and templates (chosen) vs. one `assign` call per distinct value (several commits, not atomic).

## Decision

- **Model** (personal, ADR-0010): `WeekTemplate(owner_id, name unique per owner (normalised), description, mission_id?)`; `WeekTemplateSlot(template_id CASCADE, weekday 0=Monday…6, period, kind, subtype_id?, mission_id?, location?)` unique on `(template_id, weekday, period)`, mission only on MISSION slots, location only on worked kinds (ADR-0019). Mission and subtype FKs are `RESTRICT`; deleting a subtype used by a template returns `ENTITY_REFERENCED`.
- **P6-5**: a template's `mission_id` is its default mission; the UI proposes that template for months where the mission runs and on the mission page.
- **API** (`/api/v1/agenda/week-templates`): list, create, read, `PATCH` (slots replaced as a whole), delete, `POST {id}/duplicate {name}`, `POST {id}/preview` and `POST {id}/apply` with `{start, end, strategy ∈ {SKIP, OVERWRITE}, mission_id?}`; range at most 366 days. A MISSION slot without a resolvable mission gives `422 WEEK_TEMPLATE_MISSION_REQUIRED`.
- **Plan**: each half-day of the range with a template slot gets one action, checked in this order: `HOLIDAY` (public holiday of the user's region), `LOCKED` (month locked), `OUTSIDE_MISSION` (RG-02), `CREATE` (empty), `UNCHANGED` (same kind, subtype, mission, location), `KEEP` (filled, strategy SKIP), `BLOCKED_BY_TASKS` (its tasks would become incompatible), `OVERWRITE`. Only `CREATE` and `OVERWRITE` are written; an overwritten half-day keeps its note.
- **Write path**: `HalfDayService.write(entries)` takes `(slot, values)` pairs, runs the lock guard, RG-02, subtype and task checks, and does not commit; `assign` and template application call it and commit once.
- **UI**: `/agenda/templates` (list) and `/agenda/templates/:id` (7 × 2 grid editor: select cells, give them values); an "Apply a week template" wizard opened from the month view (range = the month) and the mission page: template, range, overwrite switch, coloured preview by week, confirmation before overwriting.

## Rationale

A mission stored on every slot forces a copy of the same rhythm for each mission. Two code paths
for preview and application would let the preview lie. One `assign` per value breaks atomicity
and runs the lock guard several times.

## Consequences

- **Positive**: one rule set for every agenda write; previews are exact; a template serves many missions
- **Negative**: overwriting silently skips half-days holding tasks (shown as blocked in the preview); no recurring tasks in templates (P13, Q-F1)
- **Follow-ups**: P13 recurring tasks and alternating weeks (Q-F3)

## Compliance

`tests/integration/test_week_templates.py` (RG-10, holidays, leave, locked months, mission end, blocked tasks, isolation); frontend `templates.test.tsx`; e2e `templates.spec.ts`.
