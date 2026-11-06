# Work Orchestrator — agent guide

Personal knowledge and activity tool for a consultant developer: an agenda of half-days, tasks and subjects, plus Markdown documentation of client architectures as a graph.

## Read first

- `docs/00-CADRAGE.md` — scope, domain model, business rules (RG-xx). French.
- `docs/02-ROADMAP.md` — phases and tickets (`Pn-m`). Tick tickets when done.
- `docs/adr/README.md` — index of architecture decisions. **Accepted ADRs are binding.**
- `docs/GUIDE.md` — user guide (French): update it with any user-visible change; `CHANGELOG.md` too.

## Architecture Decision Records (mandatory)

- Before any structuring change (new dependency, entity or cardinality, cross-module rule, auth/security, deployment, deviation from an existing ADR), check `docs/adr/` and follow `docs/adr/LLM-INSTRUCTIONS.md`.
- Ship the ADR in the same change as the code, and update the index and "Next free number".
- Write `Accepted` only for choices the owner approved; your own choices are `Proposed`. List `Proposed` ADRs in your final message.
- Never contradict an Accepted ADR silently: stop and ask. To change one, write a superseding ADR.
- Reference ADRs in commits (`feat(agenda): month lock (ADR-0021)`) and in code where a choice looks arbitrary.

## Git

**Never commit, push, or create branches.** The owner handles all git operations. Leave changes in the working tree and summarise them.

## Conventions

- Code, identifiers, comments, commits, ADRs: English. UI: EN/FR via `react-i18next`; the backend returns error codes, never prose (ADR-0013, ADR-0014).
- App served under `BASE_PATH` (default `/work-orchestrator`): never hard-code absolute `/` URLs (ADR-0011).
- Personal data is always filtered by `owner_id` (ADR-0010).
- Every API route is authenticated by default (ADR-0030). Use `CurrentUser` / `AdminUser` dependencies from `app/modules/auth/dependencies.py`. Making a route public means editing `PUBLIC_ROUTERS` in `app/main.py`, the whitelist in `tests/integration/test_route_protection.py`, and ADR-0030.
- Time: use `app.core.clock.utcnow()`, never `datetime.now()`, so tests can control the clock (`clock` fixture).
- Shared helpers: trees in `app/shared/tree.py` (ancestors, descendants, cycle check), names in `app/shared/text.py` (`normalize_text` for uniqueness), list params and `Page[T]` / `not_found` / `name_already_used` / `entity_referenced` in `app/shared/schemas.py`. Taggable entities use `app/modules/tags/service.py` (`set_tags`, `tags_by_entity`) and a `TaggableType` member (ADR-0031).
- Personal data: mix in `OwnedMixin` and always query through `owned()` / `get_owned()` (`app/shared/ownership.py`); add an isolation test (second user gets 404). Tables referencing missions use `ON DELETE RESTRICT` (ADR-0032).
- Agenda writes go through `HalfDayService.write` (per-slot values, no commit; used by `assign` and week templates) / `clear` and the single lock guard `LockService.ensure_unlocked`; any new write path on half-days (week templates, tasks) must call that guard (ADR-0021, ADR-0033).
- Tasks are placed by `TaskService` (`app/modules/agenda/tasks.py`); the task/half-day matrix lives only in `app/modules/agenda/compatibility.py` and reaches the UI through `GET /agenda/compatibility` (ADR-0020, ADR-0034). `HalfDayService.assign` refuses changes that would strand incompatible tasks.
- TanStack Query: a query that has no data yet does not refetch on invalidation while its first fetch is in flight. When a side-effect must happen before a first load (e.g. holiday generation), gate the dependent queries with `enabled` instead of invalidating afterwards.
- Generated TS types (openapi-typescript): fields with a server default are *required* in request types; send them explicitly (e.g. `objectives: ""`).
- SQLAlchemy 2.1: iterate results directly (no `.tuples()`), and never `dict(result)` (a Result has `keys()`): use a comprehension.
- Documents (ADR-0036): Markdown refers to uploaded files as `attachment:<uuid>` (never a URL); `src/components/markdown.ts` rewrites wikilinks and attachments for preview and export. Linkable entity types live in `app/modules/documents/entities.py` (`ENTITY_TYPES`): register domains and architectures there in P8. In component tests, mock `components/mermaid` and `features/documents/MarkdownEditor` (no SVG layout nor reliable CodeMirror input in jsdom).
- Architecture (ADR-0037): domains and architectures are personal data tied to a client `company_id`; every link stays inside one company (`DOMAIN_COMPANY_MISMATCH`). An architecture holds entry domains plus, implicitly, their subtrees; P9 reads `GET /architectures/{id}/graph`. `ExternalLink` is polymorphic (no FK): call `delete_external_links` when deleting a domain, mission or subject.
- Mermaid export (ADR-0038): `app/modules/architecture/mermaid.py` is snapshot-tested (`backend/tests/unit/snapshots/*.mmd`, regenerate with `UPDATE_SNAPSHOTS=1 uv run pytest tests/unit/test_mermaid.py`); `frontend/src/features/architecture/graph.test.tsx` parses every snapshot with the real `mermaid.parse` (Vite `server.fs.allow` lists that folder). Graph shaping lives in pure `graphModel.ts`; in jsdom, click React Flow nodes with `fireEvent.click` (user-event trips `d3-drag`).
- E2E runs share a persistent database: give each run its own names, take dates from `freeTuesday` / `freeMonth` (`e2e/helpers.ts`, they ask the API for an empty period), search lists by the run's unique suffix; never assume an empty agenda or a short list.
- Dashboard (ADR-0039): `app/modules/dashboard` aggregates other modules and owns no table; put cross-module read models there rather than in `missions` (import cycles).
- Search (ADR-0040): searchable tables are declared in `app/modules/search/definitions.py` (`SEARCHABLES`); a new one needs a migration adding its generated `search_vector` (see `0011`). Alembic ignores those columns and the `_search` / `_name_trgm` indexes (`alembic/env.py`). Snippets carry U+E000/U+E001 markers, rendered by `features/search/Highlight.tsx`, never as HTML.
- Archive (ADR-0040): `app/modules/archive/tables.py` classifies tables from the metadata (owned / child / shared); a new table is exported automatically, but a polymorphic reference without FK goes in `POLYMORPHIC` and a shared table without unique constraint needs a `NATURAL_KEYS` entry. Test-only models must be declared in `setup_module`, not at import, or they leak into the metadata of every test.
- Uploads: `app/shared/zips.py` (`spool`, `open_zip`, `too_large`, `invalid`) for size-capped files and zips; `AttachmentService.store` writes one checked file without committing. Bigger request bodies need an exact `location` in `frontend/nginx/default.conf.template`.
- Backups: `make backup` / `make restore BACKUP=…` (`scripts/`, `COMPOSE=` targets another stack); procedure in `docs/OPERATIONS.md`.
- `?new=1` on a list page opens its creation form (`app/useCreateParam.ts`); `NEW_TASK_EVENT` on `window` opens the quick task entry (used by the `Ctrl+K` palette).
- Hardening (ADR-0041): personal routes are isolation-tested from the OpenAPI schema (`tests/integration/test_isolation.py`; add a valid body to `BODIES` if a new route would 422); every foreign key needs an index (`test_foreign_key_indexes.py`); a GET returning an array needs `limit`/`offset` or an entry with its reason in `tests/unit/test_list_bounds.py`.
- E2E specs import `test` / `expect` from `e2e/fixtures.ts` (fails on CSP violations); `e2e/a11y.spec.ts` audits pages with axe in both schemes: add new main pages there. Name controls by their visible text (extra context in `VisuallyHidden`, not an `aria-label` that hides it); use `AppPagination`; give `EntityTable` an `emptyAction`.
- Failed queries toast automatically (translated, with Retry); a query whose page renders its own error sets `meta: { inlineError: true }`. Render crashes land in `app/RouteError.tsx`.
- Frontend forms use `noValidate`: validation messages come from `@mantine/form` and are translated. Component tests fail on any missing translation key; Mantine runs with `env="test"` in `renderApp`. In tests, set `<input type="date">` with `fireEvent.change` (typing is unreliable in jsdom); Mantine selects have role `combobox`.
- Every business rule RG-xx has a named test; coverage ≥ 85 % back, ≥ 70 % front (ADR-0016).

## Commands

`make help` lists everything. Main: `make init`, `make dev`, `make test` (back + front), `make test-e2e` (isolated Docker stack, port 18081), `make lint`, `make typecheck`, `make deploy`, `make backup`, `make restore BACKUP=…`, `make migration m="..."`, `make api-client` (after any backend schema change), `make adr-new t="..."`.

## Architecture in one glance

- Backend `backend/app`: `core/` (config, db, errors, logging), `shared/` (base models, UUIDv7), `modules/<module>/` (models, schemas, repository, service, router). Register new models in `app/models.py`, routers in `app/main.py`. Errors: raise `AppError(ErrorCode.X, ...)` and add `X` to `ErrorCode` **and** to `frontend/src/i18n/{en,fr}/errors.json`.
- Frontend `frontend/src`: `app/` (providers, routes, layout, navigation), `features/<feature>/`, `api/` (generated `schema.d.ts` + `client.ts`, use `unwrap(api.GET(...))` in TanStack Query hooks), `i18n/` (EN/FR keys must match; a test enforces it).
- Tests: backend integration tests use the `client` / `db_session` fixtures (rolled-back transaction on `<db>_test`), plus `user_client` / `admin_client` (signed-in) and `make_user`; frontend tests use `renderApp(path, { user })` and the in-memory fake backend in `src/test/server.ts`; e2e runs on an isolated stack (`make test-e2e`).
