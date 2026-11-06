# ADR-0034: Agenda micro — subjects, tasks, daily log and standup

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P5 (tickets P5-1 to P5-14); Q-G1 to Q-G10
- **Tags**: domain, backend, frontend
- **Related**: ADR-0013, ADR-0020, ADR-0021, ADR-0022, ADR-0032, ADR-0033 · **Supersedes**: none

## Context

ADR-0020 fixes the task/half-day compatibility matrix and ADR-0021 the monthly lock. The default
answers to Q-G1–Q-G10 fix the shape of subjects, tasks, meetings and the daily log. Implementing
them left open questions: what a task placed on an empty half-day does, how RG-07 survives moves
and scope edits, which tasks count towards the 4 h warning, where "carry over" lands, and who
writes the standup text when the backend must not return prose (ADR-0013).

## Decision drivers

- Daily entry under 2 minutes (P5 DoD)
- Time per mission must stay trustworthy (ADR-0020, ADR-0021)
- One rule set, server-side, mirrored in the UI without duplication

## Considered options

1. **Task on an empty half-day**: fill the half-day with the subject's natural kind (chosen) vs. refuse until the half-day is filled in the month view (an extra round trip every morning).
2. **RG-07**: scope and mission frozen as soon as the subtree holds tasks, moves only between same-scope parents (chosen) vs. free changes that re-validate every task (complex, partial failures).
3. **Standup text**: built by the frontend from structured data (chosen) vs. built by the backend (prose in the API, breaks ADR-0013).

## Decision

- **Modules**: `app/modules/subjects` (`Subject`, `SubjectCategory`, routes `/subjects`, `/subject-categories`); tasks, participants, daily logs and the matrix live in `app/modules/agenda` (`compatibility.py`, `tasks.py`).
- **Subject**: personal (`OwnedMixin`), archivable, `scope ∈ {MISSION, INTERCONTRACT, TRAINING, PERSONAL}`, CHECK `scope = 'MISSION'` ⇔ `mission_id` (FK `RESTRICT`, ADR-0032), `status ∈ {OPEN, IN_PROGRESS, DONE, CANCELLED}`, optional `external_url`, optional `category_id` (instance-wide editable list seeded with the six Q-G6 values). Lists return flat rows; the UI builds the tree (ADR-0022).
- **RG-07**: a child is created with its parent's scope and mission, otherwise `422 SUBJECT_SCOPE_MISMATCH`; a move needs a parent with the same scope and mission. Scope or mission can change on a root only, propagates to the subtree, and is refused with `409 SUBJECT_HAS_TASKS` once any task uses the subtree. Archiving and restoring cascade to descendants; an archived subject accepts no new task (`SUBJECT_ARCHIVED`). Deleting is refused while children or tasks exist.
- **Task**: `half_day_id` FK `RESTRICT` (clearing a half-day with tasks → `409 HALF_DAY_HAS_TASKS`), `subject_id` FK `RESTRICT`, `kind ∈ {TASK, MEETING}`, `duration_minutes` 1–720, optional `starts_at`, `status ∈ {PLANNED, DONE, CANCELLED, CARRIED_OVER}`, `carried_from_id`. Participants (contacts) only on meetings; switching a meeting to a task drops them.
- **Placement**: the API addresses tasks by `(date, period)`. An empty slot is filled with the subject's natural kind — MISSION (+ mission, RG-02 checked), INTERCONTRACT or TRAINING; a PERSONAL subject on an empty slot gives `422 HALF_DAY_EMPTY`. The same rule applies to moves and carry-over.
- **Lock**: every task write checks `LockService.ensure_unlocked` on source and target months, except a change limited to `description` (ADR-0021).
- **RG-06**: after each write the response carries `warnings: [{code: "HALF_DAY_OVERBOOKED", params}]` when PLANNED + DONE durations of the half-day exceed 240 minutes; cancelled and carried-over tasks do not count.
- **Carry over**: copies a PLANNED task to the first slot after it (and on or after `not_before` if given) that holds a compatible half-day or can be filled as above, skipping weekends, public holidays and locked months, within 31 days (`409 NO_COMPATIBLE_HALF_DAY` otherwise); the original becomes CARRIED_OVER.
- **Daily log**: one per owner and date, three Markdown sections (done, planned, blockers), never locked.
- **Standup**: `GET /agenda/standup?date=` returns the latest earlier day with tasks (14 days back at most), its tasks, today's tasks and today's log; the frontend writes the localized text.
- **UI**: `/agenda/week/:date`, `/agenda/:year/:month/:day`, `/agenda/standup` (linked first on the home page), `/agenda/subjects`; mission page tab "Subjects"; global `n` shortcut opens quick task entry; week drag and drop uses the native HTML5 API (no new dependency) and checks the matrix from `GET /agenda/compatibility` before calling the server.

## Rationale

Refusing tasks on empty half-days would cost a detour to the month view each morning, failing the
2-minute target. Re-validating tasks on every scope change creates partial failures for a rare need.
Backend prose would duplicate the i18n layer that ADR-0013 keeps in the frontend.

## Consequences

- **Positive**: a morning takes a few clicks; time accounting stays consistent; one matrix
- **Negative**: placing a task can silently fill an empty half-day, visible afterwards in the month view; a subject's scope is fixed once used (create a new subject instead)
- **Follow-ups**: P6 week templates must keep tasks compatible; P8-4 `SubjectDomain`; P10 time per subject from DONE tasks

## Compliance

`tests/unit/test_compatibility.py::test_rg03_rg04_rg05_matrix` (28 cells); `tests/integration/test_subjects.py` (RG-07, RG-08, isolation); `tests/integration/test_tasks.py` (RG-03 to RG-06, RG-13, carry over, standup); frontend `micro.test.tsx`; e2e `standup.spec.ts`.
