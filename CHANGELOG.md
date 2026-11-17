# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Decisions behind each item are ADRs in
[docs/adr/](docs/adr/README.md); the phases are in [docs/02-ROADMAP.md](docs/02-ROADMAP.md).

## [Unreleased]

### Added

- **Live document editing** (ADR-0043): documents open in a Notion-like editor working on
  the stored Markdown, with a "/" menu (headings, lists, task lists, quote, code, Mermaid,
  table, divider, links to documents and other entities, files), `[[` links, Mermaid diagrams
  drawn under their source, and pasted document URLs turned into links. Modes: Edit,
  Markdown source, Preview (the side-by-side mode is gone).
- **New sub-document** button on a document page.
- **Projects** (ADR-0042): a mission is split into projects, each holding a document tree and
  links to the client's architectures (shared between projects). A "Work context" block in the
  menu picks the current mission and project; Documents and Architecture open on it, with
  mission, no-project and all scopes. Project page with Documents, Architectures and About tabs.
- **Document tree**: alphabetical order at every level (accents and case ignored), drag and
  drop to nest a page or take it out to a project's top level, sub-pages following.

### Changed

- The mission's **Architectures** tab becomes **Projects**; architectures link to projects
  (`/architectures/{id}/projects/{project_id}` replaces `/missions/{mission_id}`).
- Migration `0013`: every mission with architectures or attached documents gets a "Général"
  project holding them; a mission or project still holding projects or documents cannot be
  deleted (RG-16).
- Deleting a document deletes its sub-pages and their history (RG-17); it used to be refused
  with a conflict.

### Fixed

- Markdown source editor: syntax marks, gutter, selection and completion popup readable in the
  dark scheme.

## [1.0.0] — to be tagged

First complete version (roadmap P0 to P12). To be tagged `v1.0.0` once used daily for two
weeks without a blocking bug (P12 definition of done).

### Added

- **Foundations (P0)**: FastAPI + PostgreSQL backend, React + Mantine frontend, Docker Compose
  stack served under a base path, Makefile, ADR tooling, test suites with coverage thresholds.
- **Accounts (P1)**: sign-in with rotating sessions, roles, password policy, login throttling,
  every route authenticated by default.
- **Directory (P2)**: sectors, companies and their org charts, contacts and employment history,
  technologies, tags, duplicate detection.
- **Missions (P3)**: missions with client and consulting firm, contacts and roles, weighted
  technologies, end-date history, status suggestions.
- **Agenda (P4–P6)**: half-days by kind and subtype, month, year, week and day views, public
  holidays pre-filled, month locks; subjects, tasks, daily log and stand-up, quick task entry;
  week templates applied on a range with preview.
- **Documents (P7)**: Markdown editor with Mermaid, wikilinks and backlinks, attachments,
  versions and drafts, templates, Markdown export.
- **Architecture (P8–P9)**: architectures, domain trees and relations per client, interactive
  graph with saved layout, Mermaid/SVG/PNG export, knowledge graph of documents.
- **Mission dashboard (P10)**: time spent and remaining, time per subject, suggested
  technology weights, cross-links between agenda, subjects and domains; career timeline.
- **Search and data (P11)**: full-text search and `Ctrl+K` palette, per-user archive export and
  import, Obsidian/Markdown import, contacts CSV import and export, `make backup` /
  `make restore` with a tested restore procedure and an optional daily backup service.
- **Hardening (P12)**: Content-Security-Policy and security headers checked on every e2e page,
  automatic test that no personal route answers another user, indexes on every foreign key,
  year-view and dashboard performance tests with SQL query budgets, paged document history,
  WCAG 2.1 AA audit (axe) of the main pages in light and dark mode, keyboard navigation in the
  month grid, translated loading errors with retry, crash page and empty states with actions,
  migration round trip checked against the models, user guide ([docs/GUIDE.md](docs/GUIDE.md)).
