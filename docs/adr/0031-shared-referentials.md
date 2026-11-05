# ADR-0031: Shared referentials — model, tags, deletion and reference data

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: roadmap phase P2 (tickets P2-1 to P2-15); Q-C3, Q-C4, Q-C5, Q-D1 to Q-D4, Q-J3, Q-J4
- **Tags**: data, domain
- **Related**: ADR-0010, ADR-0013, ADR-0014, ADR-0022 · **Supersedes**: none

## Context

Phase P2 introduces the instance-wide directory: sectors, companies, client organisation units, contacts with employment history, a technology catalogue and tags. Several design choices were not fixed by earlier ADRs: how tags attach to many entity types, how names are kept unique, what deleting means for each entity, and how reference data reaches a new instance.

## Decision drivers

- One directory shared by all users (ADR-0010), consistent and duplicate-free
- Tags reusable by future modules (documents, subjects, domains) without schema churn
- Never lose history by deleting something referenced elsewhere
- A new instance is useful immediately (sectors and technologies pre-filled), without overwriting user edits

## Considered options

1. **Tags**: polymorphic `taggings(tag_id, entity_type, entity_id)` (chosen) vs. one join table per taggable entity (referential integrity, but a migration and code for each new module) vs. a `text[]` column per entity (no rename, no colours, no usage count).
2. **Uniqueness**: `normalized_name` column (accent-, case- and space-insensitive) with a unique index (chosen) vs. the `unaccent` + `citext` extensions (extension management in migrations, harder to reproduce in tests).
3. **Reference data**: idempotent CLI command run by `make init` / `make deploy` (chosen) vs. data migrations (couples data to schema history; re-adding a deleted sector on every upgrade is unwanted).

## Decision

- **Model** (tables `sectors`, `companies`, `company_secondary_sectors`, `org_units`, `contacts`, `contact_employments`, `technologies`, `tags`, `taggings`; `users.employer_company_id`):
  - Sector: tree (ADR-0022), `name_fr` + `name_en` (ADR-0013).
  - Company: `types` is an array of `CLIENT | ESN | OTHER` (at least one; defaults to `OTHER`), one primary sector + many secondary sectors, optional parent company (tree, cycle-checked).
  - OrgUnit: tree per company with a free `level_label`; a parent must belong to the same company (`ORG_UNIT_COMPANY_MISMATCH`).
  - Contact: current `company_id` + optional `org_unit_id` (the unit must belong to the company; the company is inferred from the unit when omitted). Changing the company automatically appends the previous position to `contact_employments`; positions can also be added and removed manually.
  - Technology: name, category (14 values), aliases; versions belong to links (mission/domain ↔ technology), not to the catalogue (Q-J4).
- **Names**: companies, technologies and tags are unique on `normalized_name` (`app/shared/text.normalize_text`); duplicates return `409 NAME_ALREADY_USED` with `params.entity`. Contacts are not unique; `GET /contacts/duplicates` returns candidates with the same normalised full name or a shared e-mail, shown live in the form (P2-9).
- **Tags**: `taggings` has no foreign key on `entity_id`; integrity is the services' job (`set_tags` validates tag ids). `TaggableType` lists taggable entities (`COMPANY`, `CONTACT`, `TECHNOLOGY` today). Deleting a tag removes it everywhere (cascade).
- **Deletion policy**:
  - Companies, contacts, technologies: never deleted, only archived/restored (`archived_at`); lists hide archived rows unless `include_archived=true`.
  - Sectors and org units: hard delete only when unreferenced; otherwise `409 ENTITY_REFERENCED` with `params.referencedBy`.
  - Tags and employment records: hard delete.
- **Errors**: generic codes with an `entity` parameter (`NOT_FOUND`, `NAME_ALREADY_USED`, `ENTITY_REFERENCED`) instead of one code per entity.
- **Reference data**: `app/seed/reference.py` (35 sectors on two levels, 180 technologies) loaded by `app.cli seed-reference`, idempotent on natural keys, never modifying existing rows. Run by `make init`, `make deploy`, `make test-e2e`. Fictional demo data (`app.cli seed-demo`, `make seed`) is refused in production.
- **Organisation editing**: moving a unit is done by choosing another parent in its edit form; drag-and-drop in the tree is deferred.

## Rationale

Per-entity tag tables would multiply migrations as modules arrive (P7, P8). Database extensions add operational steps for a benefit a Python normaliser already provides. Data migrations would resurrect reference rows a user deliberately deleted.

## Consequences

- **Positive**: one tagging mechanism for every future module; consistent duplicate handling; history preserved by archiving; useful catalogue on day one
- **Negative**: no database-level integrity on `taggings.entity_id` (orphans possible if a future hard delete forgets to clear tags); `normalized_name` must be maintained by every write path; drag-and-drop for the org chart postponed
- **Follow-ups**: purge orphan taggings in the P12 maintenance job; full-text search on contacts and companies in P11 (ADR-0026)

## Compliance

`tests/integration/test_companies.py`, `test_contacts.py`, `test_sectors_tags_technologies.py`, `test_tree.py`, `test_seed.py` (idempotency, uniqueness of reference names); frontend `directory.test.tsx`; e2e `directory.spec.ts`.
