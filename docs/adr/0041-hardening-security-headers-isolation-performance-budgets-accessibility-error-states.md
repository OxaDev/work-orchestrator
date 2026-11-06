# ADR-0041: Hardening: security headers, isolation, performance budgets, accessibility, error states

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P12 (tickets P12-1 to P12-9)
- **Tags**: security, frontend, backend, process
- **Related**: ADR-0010, ADR-0011, ADR-0013, ADR-0014, ADR-0016, ADR-0028, ADR-0030 · **Supersedes**: none

## Context

Before V1, P12 asks for a full CSP (planned by ADR-0028), proof that no user reaches another's
data on any route, profiling of the heavy views, a WCAG audit with contrasts, translated error
and empty states, and release material. Most checks must keep holding as routes, tables and
pages are added after V1, so they are written as tests that discover what to check.

## Decision drivers

- A rule nobody re-checks by hand: new routes, tables and pages are covered automatically
- Nothing leaves the machine (ADR-0028); the existing UI library stays (Mantine, Mermaid)
- One way to report errors, translated (ADR-0013, ADR-0014)

## Considered options

1. **Checks discovered from the schema and the metadata** (chosen) vs. hand-written lists per
   route or table (forget new ones).
2. **Strict CSP with `style-src 'unsafe-inline'`** (chosen) vs. nonces/hashes for styles
   (Mantine CSS variables and Mermaid SVG styles are generated at runtime).
3. **Global toast for failed reads + opt-out** (chosen) vs. error handling in every page (32
   pages, easy to forget).

## Decision

- **Headers** (nginx `security-headers.conf`, every location): `Content-Security-Policy:
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
  blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none';
  base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, plus `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` denying camera, microphone,
  geolocation, payment, USB, and `Cross-Origin-Opener-Policy: same-origin`. External images in
  Markdown are therefore not shown. HSTS stays with the external TLS proxy (ADR-0011). Every e2e
  test runs through a Playwright fixture (`e2e/fixtures.ts`) that fails on any CSP violation.
- **Isolation**: `tests/integration/test_isolation.py` reads every route of the OpenAPI schema
  whose path holds a personal id (`mission_id`, `subject_id`, `task_id`, `document_id`,
  `attachment_id`, `architecture_id`, `domain_id`, `relation_id`, `link_id`, week-template
  `template_id`), calls it as another user with a valid body and requires **404** (existence is
  not disclosed), then checks the owner's data is intact. CORS stays closed by default (tested).
- **Performance**: every foreign key leads an index (`tests/unit/test_foreign_key_indexes.py`,
  migration 0012 adds the 8 missing ones). The year view, week tasks, mission overview and
  career on a full year (730 half-days, 1,460 tasks) must each answer in under 1 s with at most
  30 SQL queries (`test_year_view_performance.py`); the graph keeps its P8 budget. A GET returning
  an array is paged (`limit`/`offset` or `Page[T]`) unless listed with its reason in
  `tests/unit/test_list_bounds.py` (trees shown whole, date ranges, short referentials); document
  versions are now paged.
- **Accessibility**: `e2e/a11y.spec.ts` runs axe (WCAG 2.0/2.1 A and AA) on 16 main pages in
  light and dark mode. Theme: primary shade indigo 8, light-scheme dimmed text and placeholders in
  gray 7, dark-scheme dimmed text, placeholders and links lightened, light-variant text and weak
  filled colours (cyan, teal, green, lime, yellow, orange) darkened with `color-mix`; links always
  underlined. Controls are named by their visible text (no `aria-label` hiding it), extra context
  in `VisuallyHidden`; the two `nav` landmarks are labelled; pagination controls are named
  (`AppPagination`). The month grid moves the focus with the arrow keys (left/right: day; up/down:
  morning, afternoon, next week).
- **Errors and empty states**: the query cache shows one translated toast per failed read with a
  **Retry** button; 401 is left to the session redirect; a query whose page shows the error
  itself sets `meta: { inlineError: true }`. A page that crashes is replaced by `RouteError`
  inside the shell (reload, home). Empty lists offer their creation action (`emptyAction` of
  `EntityTable`, missions, documents with Markdown import).
- **Release**: version 1.0.0 in code, `CHANGELOG.md`, user guide `docs/GUIDE.md`; the owner tags
  `v1.0.0` after the two-week DoD (git operations are the owner's).

## Rationale

Discovered checks keep V1's guarantees as the code grows. Style nonces would require server
rendering of every Mantine/Mermaid style; scripts, the real XSS vector, stay `'self'` only. A
global error channel covers every page at once, and the opt-out avoids double messages.

## Consequences

- **Positive**: new routes, tables, list endpoints and pages are checked without editing tests;
  contrast and keyboard issues fail the e2e run
- **Negative**: images hosted elsewhere do not display in documents; underlined links everywhere;
  the isolation test needs a valid body for routes whose body validation would answer 422 first
- **Follow-ups**: P13 items; axe audit to extend to new pages

## Compliance

`frontend/e2e/fixtures.ts`, `frontend/e2e/a11y.spec.ts`, `frontend/e2e/smoke.spec.ts`
(headers), `backend/tests/integration/test_isolation.py`, `test_route_protection.py` (CORS),
`backend/tests/unit/test_foreign_key_indexes.py`, `test_list_bounds.py`,
`backend/tests/integration/test_year_view_performance.py`, `test_migrations.py` (round trip and
`alembic check`), `frontend/src/app/errors.test.tsx`.
