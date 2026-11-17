# ADR-0042: Projects between missions, documents and architectures

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Project owner
- **Source**: conversation 2026-11-17 ("une mission comporte plusieurs projets ; un projet comporte plusieurs architectures et plusieurs documents"; options chosen: many-to-many architectures, `project_id` on the document tree, context switcher)
- **Tags**: domain, data, backend, frontend
- **Related**: ADR-0010, ADR-0022, ADR-0023, ADR-0032, ADR-0036, ADR-0037 · **Supersedes**: ADR-0023 (the mission ↔ architecture link only)

## Context

A mission often covers several workstreams (payments overhaul, card platform…). Documents are
one personal tree and architectures are linked to whole missions (ADR-0023), so the
documentation of every workstream mixes on the same pages. The owner wants to work "at the
project level": pick a mission, then a project, and see only that project's documents and
architectures. ADR-0023 makes architectures belong to the client company so that they can be
reused from one mission to the next; that reuse must survive.

## Decision drivers

- Documentation scoped to one workstream, without losing the cross-project views
- Keep architectures as client knowledge reusable across missions (ADR-0023 driver)
- One project per document tree: a page never shows in two projects
- Existing data moves over without manual work

## Considered options

1. **Project entity; architectures many-to-many with projects; `project_id` on documents** (chosen)
2. **Architecture owned by one project** — simpler, but an architecture can no longer be shared
   and renewal missions duplicate it (the option ADR-0023 rejected)
3. **Documents attached to projects through `DocumentAttachment`** — no schema change, but a page
   can sit in several projects and a tree can be split across them
4. **Mandatory project on every document** — no "unfiled" bucket; personal notes need a fake project

## Decision

- **Model** (`app/modules/projects`): `Project(owner_id, mission_id → missions RESTRICT, name,
  normalized_name, description, archived_at)`, name unique per mission (`NAME_ALREADY_USED`).
  Personal data (`OwnedMixin`, ADR-0010).
- **Architectures**: `ProjectArchitecture(project_id CASCADE, architecture_id CASCADE)` replaces
  `MissionArchitecture`. An architecture still belongs to its client company and can be linked to
  any project of a mission at that client (`422 ARCHITECTURE_COMPANY_MISMATCH` otherwise). A
  mission's architectures are those of its projects. API: `PUT|DELETE
  /architectures/{id}/projects/{project_id}`, `ArchitectureCreate.project_id`, list filter
  `project_id`; `ArchitectureSummary.projects` (with their mission), `missions` derived.
- **Documents**: `Document.project_id` (nullable, → projects RESTRICT). Every page of a tree has its
  root's project: creating under a parent and moving under a parent take the parent's project;
  moving to the top level takes `DocumentMove.project_id` when sent (null = unfiled), else keeps
  the current one; a move updates the whole subtree. List filters: `project_id`, `mission_id`
  (all its projects), `unfiled`. The Markdown import takes `project_id` for its top-level pages.
- **Deletion**: a project holding documents is refused (`409 ENTITY_REFERENCED`, archive it); its
  architecture links go, the architectures stay. A mission with projects is refused the same way.
- **Migration `0013`**: each mission linked to an architecture or with attached documents gets a
  project "Général" that takes its architecture links and the trees of its attached top-level
  documents; `mission_architectures` is dropped (the downgrade rebuilds it from the projects).
- **UI**: a "Work context" block (current mission › current project) at the top of the navbar,
  kept in `localStorage` (`wo.workContext`, convenience only). `/documents` and `/architecture`
  show the current project by default, with "mission", "no project" and "all" scopes. Project
  page `/missions/:missionId/projects/:projectId/{documents|architectures|about}`; opening it sets
  the context. The mission's "Architectures" tab becomes "Projects".
- **Document tree**: pages sorted alphabetically at every level (accents and case ignored,
  numbers in natural order); drag and drop onto a page nests it, onto a group's top-level zone
  takes it out (into that group's project). The "Parent page" field remains the keyboard path.

## Rationale

- Option 2 breaks the reuse driver of ADR-0023 for no gain: the link table costs one join.
- Option 3 allows a tree split across projects and pages listed twice: the project view would
  again mix documentation, which is what the owner wants to stop.
- Option 4 forces fake projects for personal notes and templates; "no project" is a real case.

## Consequences

- **Positive**: one place per workstream; architectures still shared at the client; existing
  data filed automatically; the documents and architecture pages stay usable without a context.
- **Negative**: one more level to create before filing documents; a page moved between projects
  drags its subtree along; projects are not yet in the global search nor a wikilink type; the
  context lives in the browser, so another device starts with no context.
- **Follow-ups**: add projects to `SEARCHABLES` and to `LinkType` if the owner wants
  `[[project:…]]` links; dashboard could summarise per project.

## Compliance

- `backend/tests/integration/test_projects.py` (CRUD, tree propagation on create and move,
  deletion rules, isolation), `test_architecture.py::test_architectures_and_projects`,
  `test_migrations.py::test_0013_moves_mission_links_into_a_default_project`, and the generic
  `test_isolation.py` (`project_id` is a personal path parameter).
- `frontend/src/features/projects/projects.test.tsx` (context switcher, scoping, drag and drop,
  alphabetical order).

## Notes

- 2026-11-17: the document editor changed in the same request; see ADR-0043.
