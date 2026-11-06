# ADR-0039: Mission dashboard, technology weight suggestion and cross-links

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P10 (tickets P10-1 to P10-8); Q-J1, Q-J2, Q-K1 to Q-K3
- **Tags**: domain, backend, frontend
- **Related**: ADR-0018, ADR-0020, ADR-0024, ADR-0032, ADR-0037 · **Supersedes**: none

## Context

The mission page is the junction of the agenda and the architecture sub-apps (cadrage §6.4). The
default answers ask for time spent (days, split by subject, days left), weighted technologies
with a computed suggestion beside the manual weight (Q-J2), contacts, documents, a career
timeline, and links from any agenda day to the architecture documentation in at most two clicks
(P10 DoD). Open points: how time is counted, the suggestion formula, where aggregation code
lives, and how tasks reach domains.

## Decision drivers

- Figures that can be recomputed by hand from the agenda (P10-8)
- The weight stays a human decision (ADR-0032)
- No import cycles between modules; one request per dashboard

## Considered options

1. **Aggregation**: one `GET /missions/{id}/overview` built by a `dashboard` module reading the other modules (chosen) vs. the page calling eight endpoints (slow, inconsistent snapshots) vs. putting it in `missions` (missions would import agenda, subjects, architecture and documents, which already import missions).
2. **Suggestion formula**: time on the subjects linked to the domains using a technology, scaled to 1–5 (chosen) vs. counting domains per technology (ignores what was actually worked on) vs. no suggestion (Q-J2 asks for one).
3. **Task ↔ domain**: the task read model carries its subject's domains (chosen) vs. a lookup per task in the UI.

## Decision

- **Module** `app/modules/dashboard`: `GET /missions/{id}/overview` and `GET /career`; it reads the other modules and owns no table.
- **Time**: days = mission half-days ÷ 2, split into done (date ≤ today) and planned (later). Days left = expected working days (weekdays, holidays excluded, ADR-0033) from tomorrow to the effective end (actual, else planned); none without an end date, 0 once ended. Split by subject = minutes of DONE tasks of the mission, grouped by top-level subject (subtree included), largest first.
- **Tasks**: the 10 latest before today and the 10 next PLANNED from today.
- **Weight suggestion** (Q-J2): for each technology, `minutes` = DONE minutes of the mission's tasks whose subject is linked to a domain using it; `suggested = 1 + round(4 × minutes / max minutes)`. Technologies of domains in the mission's architectures with no time get 1. Technologies not yet on the mission are proposed too. The UI applies a suggestion through the existing weight endpoint; nothing is written automatically.
- **Contacts** grouped by role; **architectures** of the mission; **documents** attached and linking to it.
- **Career** `GET /career`: every mission (archived included) with its days and its top 5 technologies by weight.
- **Cross-links**: `TaskRead.domains` lists the domains of the task's subject. Day view shows the mission's architectures and each task's domains (architecture or domain sheet in one click); the domain sheet links each task to its day; week view accepts `?subject=` or `?domain=` to highlight the matching tasks. A backlinks panel appears on mission, architecture, domain, company and contact pages.
- **Charts** (dataviz guidance): KPI tiles; time per subject as ranked horizontal bars in one hue, values written, folded into "Others" beyond 6; career as a timeline coloured by mission colour with names written. No chart library.

## Rationale

Eight calls per page cost latency and can show figures from different moments. Counting domains
ignores where time went. Per-task lookups multiply requests in the week view.

## Consequences

- **Positive**: a mission page that answers "where did my time go and on what"; agenda ↔ architecture in one or two clicks
- **Negative**: the overview is computed on each request (fine at personal scale, to cache if it grows); the suggestion is only as good as the subject ↔ domain links the user maintains
- **Follow-ups**: P11 search; P13 skills module (Q-J5)

## Compliance

`tests/integration/test_dashboard.py` (aggregates on a known dataset, suggestion formula, career, isolation); frontend `dashboard.test.tsx`; e2e `dashboard.spec.ts` (day → architecture in two clicks).
