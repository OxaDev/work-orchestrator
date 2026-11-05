# ADR-0024: Markdown as source of truth, wikilinks and backlinks

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: initial brief ("all documentation in Markdown", copy-paste to client tools); Q-I1 to Q-I8
- **Tags**: documents
- **Related**: ADR-0023, ADR-0025, ADR-0027 · **Supersedes**: none

## Context

Documentation is written in Markdown and later pasted into client tools. It must link to entities (domains, contacts, missions) and render Mermaid diagrams. The owner wants a Notion-like experience with a graph flavour.

## Decision drivers

- Lossless copy-paste out of the app
- Links between documents and entities, with backlinks
- Mermaid rendered inline

## Considered options

1. **Raw Markdown stored as text; CodeMirror editor + live preview; wikilinks parsed server-side**
2. **Block-based WYSIWYG (Notion-like, JSON blocks)** — nicer editing, lossy Markdown export
3. **Files on disk (Obsidian-like vault)** — no transactional links to DB entities

## Decision

- `Document(owner_id, parent_id?, title, slug, content_md, archived_at)`; tree of pages **and** attachments to entities via `DocumentAttachment(document_id, entity_type, entity_id)`.
- Every explicit save creates a `DocumentVersion`; autosave writes a draft without a version. Restore = new version.
- Dialect: GitHub Flavored Markdown + ```` ```mermaid ```` blocks.
- Wikilinks: `[[<type>:<uuid>|<label>]]`, inserted via autocomplete on `[[`. Types: `document, mission, domain, architecture, contact, company, subject, technology`. Parsed server-side on save into `DocumentLink` rows (backlinks).
- Export "Copy as Markdown": wikilinks become plain labels (default) or absolute links; option to replace Mermaid blocks with SVG images for tools without Mermaid support (Confluence).
- Templates (`DocumentTemplate`): domain sheet, meeting notes, mission onboarding, "rapport d'étonnement", ADR.
- WYSIWYG editing is out of V1 (P13).

## Rationale

Block JSON (option 2) breaks the core promise of clean Markdown export. A file vault (option 3) cannot keep referential integrity with entities.

## Consequences

- **Positive**: what you write is exactly what you paste
- **Negative**: Markdown editing is less friendly than Notion for non-technical writing
- **Follow-ups**: P7-1 to P7-13

## Compliance

Unit tests on the wikilink parser and the export transformer (snapshots).
