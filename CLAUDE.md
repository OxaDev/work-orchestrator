# Work Orchestrator — agent guide

Personal knowledge and activity tool for a consultant developer: an agenda of half-days, tasks and subjects, plus Markdown documentation of client architectures as a graph.

## Read first

- `docs/00-CADRAGE.md` — scope, domain model, business rules (RG-xx). French.
- `docs/02-ROADMAP.md` — phases and tickets (`Pn-m`). Tick tickets when done.
- `docs/adr/README.md` — index of architecture decisions. **Accepted ADRs are binding.**

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
- Agenda writes go through `HalfDayService.assign` / `clear` (slot-based, atomic) and the single lock guard `LockService.ensure_unlocked`; any new write path on half-days (week templates, tasks) must call that guard (ADR-0021, ADR-0033).
- TanStack Query: a query that has no data yet does not refetch on invalidation while its first fetch is in flight. When a side-effect must happen before a first load (e.g. holiday generation), gate the dependent queries with `enabled` instead of invalidating afterwards.
- Generated TS types (openapi-typescript): fields with a server default are *required* in request types; send them explicitly (e.g. `objectives: ""`).
- SQLAlchemy 2.1: iterate results directly (no `.tuples()`), and never `dict(result)` (a Result has `keys()`): use a comprehension.
- Frontend forms use `noValidate`: validation messages come from `@mantine/form` and are translated. Component tests fail on any missing translation key; Mantine runs with `env="test"` in `renderApp`. In tests, set `<input type="date">` with `fireEvent.change` (typing is unreliable in jsdom); Mantine selects have role `combobox`.
- Every business rule RG-xx has a named test; coverage ≥ 85 % back, ≥ 70 % front (ADR-0016).

## Commands

`make help` lists everything. Main: `make init`, `make dev`, `make test` (back + front), `make test-e2e` (isolated Docker stack, port 18081), `make lint`, `make typecheck`, `make deploy`, `make migration m="..."`, `make api-client` (after any backend schema change), `make adr-new t="..."`.

## Architecture in one glance

- Backend `backend/app`: `core/` (config, db, errors, logging), `shared/` (base models, UUIDv7), `modules/<module>/` (models, schemas, repository, service, router). Register new models in `app/models.py`, routers in `app/main.py`. Errors: raise `AppError(ErrorCode.X, ...)` and add `X` to `ErrorCode` **and** to `frontend/src/i18n/{en,fr}/errors.json`.
- Frontend `frontend/src`: `app/` (providers, routes, layout, navigation), `features/<feature>/`, `api/` (generated `schema.d.ts` + `client.ts`, use `unwrap(api.GET(...))` in TanStack Query hooks), `i18n/` (EN/FR keys must match; a test enforces it).
- Tests: backend integration tests use the `client` / `db_session` fixtures (rolled-back transaction on `<db>_test`), plus `user_client` / `admin_client` (signed-in) and `make_user`; frontend tests use `renderApp(path, { user })` and the in-memory fake backend in `src/test/server.ts`; e2e runs on an isolated stack (`make test-e2e`).
