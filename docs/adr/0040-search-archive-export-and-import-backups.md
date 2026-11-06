# ADR-0040: Search, archive export and import, backups

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P11 (tickets P11-1 to P11-9); Q-K4, Q-D5, Q-I8, Q-M7
- **Tags**: search, data, deployment
- **Related**: ADR-0006, ADR-0010, ADR-0012, ADR-0024, ADR-0026, ADR-0027 · **Supersedes**: none

## Context

ADR-0026 fixes PostgreSQL full-text search (`tsvector`, `unaccent`, `pg_trgm`); ADR-0027 asks
to back up and restore database and uploads together; ADR-0012 names `make backup` / `make
restore`, an optional daily service and 30-day retention. Open points: how as-you-type queries
and highlighted snippets work safely, which library drives `Ctrl+K`, what an export archive
holds and how it restores (ids, owner, shared referentials), how Obsidian notes and CSV contacts
come in, and how backups run with no extra tooling on the host.

## Decision drivers

- A restore on a new machine works by following the documentation (P11 DoD)
- An archive must not lose links (wikilinks and `attachment:` references hold ids)
- No new service; nothing leaves the machine (ADR-0028)

## Considered options

1. **Archive ids**: keep ids and import into an account holding none of them (chosen) vs. new ids with rewriting of every reference, including inside Markdown (fragile, lossy on unknown references).
2. **Archive scope**: tables classified automatically from the model — owned, child of owned, shared (chosen) vs. a hand-written list per table (silently forgets new tables).
3. **Backups**: `pg_dump` and `tar` run inside the stack's containers by a script (chosen) vs. host tools (version mismatch with the server, missing binaries).

## Decision

- **Search** (ADR-0026): generated `search_vector` columns (French + English over an immutable `f_unaccent` wrapper; title weight A, body B; GIN) on documents, daily logs, tasks, subjects, domains, architectures, missions, contacts, companies, technologies; `pg_trgm` indexes on names. A query is split into words, each a prefix (`word:*`), all required, in either language; names also match by trigram similarity ≥ 0.3. `GET /search?q=&types=&limit=` returns `{type, id, title, snippet, date?, archived, rank}` ranked by `ts_rank_cd`, personal types scoped to the owner (ADR-0010). Snippets come from `ts_headline` with U+E000 / U+E001 as highlight markers, turned into `<mark>` by the client: no HTML from the server.
- **`Ctrl+K`**: `@mantine/spotlight` (Mantine family, ADR-0006): search results and actions (new task, today, standup, week, new document, new mission).
- **Export** `GET /export` streams `work-orchestrator-<date>.zip`: `manifest.json` (format 1, app version, date, profile), `data/<table>.json` for the user's owned tables (`owner_id`), their child tables (a foreign key to an owned row) and shared referentials (everything else; `users`, `refresh_tokens`, `login_throttles` excluded; polymorphic `taggings` only about exported rows), `documents/<slug>.md` (readable copy), `attachments/<id>` (files). Tables are classified from the SQLAlchemy metadata (`app/modules/archive/tables.py`); only the exceptions are listed by hand.
- **Import** `POST /import` (zip ≤ 200 MB, expanded ≤ 2 GB): only into an account holding no personal data (`409 IMPORT_ACCOUNT_NOT_EMPTY`), except generated public holidays, which are replaced (a fresh account generates them at its first agenda visit). Owned rows keep their ids and are re-owned by the current user; an id already in the instance gives `409 IMPORT_CONFLICT`. A shared row whose id is absent but whose natural key exists (unique constraint; `sectors`: parent + French name) is matched to the existing row, and every reference to it is rewritten, Markdown included (seeded referentials get new ids on each instance); otherwise it is inserted. Tree rows are inserted parents first. Files are checked against their SHA-256 and written under the new owner; one transaction, written files removed on failure. Profile (employer, holiday region) applied when empty. Bad zip or manifest: `400 IMPORT_INVALID_ARCHIVE {reason}`.
- **Markdown import** `POST /documents/import-markdown` (zip ≤ 50 MB, ≤ 2 000 files, optional `parent_id`): one document per `.md`, title from the first `# ` heading else the file name, folders become parent pages (a single top folder is the vault itself), hidden files and `__MACOSX` ignored; `[[Note]]`, `[[Note|label]]`, `[[Note#heading]]` become `[[document:<id>|label]]` when the note is in the archive (path, then name, like Obsidian), others are left as written and counted; `![[file]]` and relative `![alt](path)` are stored as attachments with the ADR-0027 checks (refused files counted, reference left); fenced code untouched. Report `{documents, folders, attachments, unresolved_links, skipped_files, root_ids}`.
- **CSV contacts**: `GET /contacts/export.csv` (`;`, UTF-8 BOM, active contacts; cells starting with `=`, `+`, `-`, `@` prefixed with `'` against formula injection, phone numbers excepted, and unprefixed on import) and `POST /contacts/import?dry_run=` (`;` or `,` detected from the header, UTF-8 or Windows-1252): columns `first_name, last_name, job_title, email_work, email_personal, phone_work, phone_mobile, linkedin_url, company, notes` (headers normalised, unknown ones ignored; `400 CSV_INVALID_HEADER` without both names); company matched by normalised name and **created when missing**; a row matching an existing contact or an earlier row (same normalised name, and a shared e-mail or no e-mail on either side) skipped; report `{created, skipped, companies_created, errors: [{line, field, code}]}` with codes `REQUIRED`, `TOO_LONG`, `INVALID_EMAIL`, `INVALID_URL`, `INVALID_VALUE`. The UI always runs the dry run first.
- **Backups** `scripts/backup.sh`: `pg_dump -Fc` in the `db` container and `tar` of `/data/uploads` in the `backend` container into `backups/<YYYYMMDD-HHMMSS>/` (`db.dump`, `uploads.tar.gz`, `INFO` with the Alembic revision, `SHA256SUMS`; written as `.partial` then renamed); deletes sets older than `BACKUP_RETENTION_DAYS` (30). `make restore BACKUP=<dir>` (`scripts/restore.sh`) checks the checksums, asks to type the set's name (`YES=1` skips), stops the backend, `pg_restore --clean --if-exists --single-transaction`, replaces the uploads, restarts and migrates. `COMPOSE=` targets another stack (the e2e drill). Optional Compose service `backup` (profile `backup`, `make backup-service`, `scripts/backup-loop.sh` in a `postgres:17` image) writes the same layout every `BACKUP_INTERVAL_SECONDS` (one day).
- **Proxy**: nginx keeps 25 MB for the API and allows 210 MB on `/api/v1/import` and 55 MB on `/api/v1/documents/import-markdown` only (exact locations, shared `api-proxy.conf` snippet); the backend enforces the real limits.

## Rationale

Renumbering ids rewrites references hidden in Markdown and loses any it does not understand. A
hand-written table list rots. Host-side `pg_dump` must match the server's major version.

## Consequences

- **Positive**: search over everything with no extra service; a self-contained, readable archive; restores with two commands
- **Negative**: an archive cannot be imported twice into the same instance, nor into an account that already holds data (ids kept); search vectors double the indexed text; the backup script needs Docker Compose on the host; the CSV import may create companies
- **Follow-ups**: P12 hardening (rate limits on import), P13 vCard

## Compliance

`tests/integration/test_search.py` (stemming, accents, prefixes, trigram, isolation, no markup), `tests/integration/test_archive.py` (round trip, holidays replaced, conflict, not empty, natural-key matching, tampered file, limits), `tests/integration/test_markdown_import.py`, `tests/integration/test_contacts_csv.py`; `frontend/src/features/search/search.test.tsx`, `frontend/src/features/data/data.test.tsx`, `frontend/e2e/data.spec.ts`; restore drill on the e2e stack documented in `docs/OPERATIONS.md`.
