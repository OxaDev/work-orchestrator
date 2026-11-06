# ADR-0036: Documents — editor, rendering, links, files and templates

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P7 (tickets P7-1 to P7-13); Q-I1 to Q-I7
- **Tags**: documents, backend, frontend, security
- **Related**: ADR-0010, ADR-0011, ADR-0024, ADR-0025, ADR-0027, ADR-0028 · **Supersedes**: none

## Context

ADR-0024 fixes Markdown as source of truth, wikilinks, versions, export and templates; ADR-0027
fixes local file storage; ADR-0025 picks `mermaid` for browser rendering; ADR-0028 forbids runtime
network calls. Implementing them requires choosing libraries (editor, code highlighting, multipart
upload), how stored Markdown refers to uploaded files when the app runs under a sub-path
(ADR-0011), how SVG is "sanitized", where drafts live, and how links to entities not built yet
(domains, architectures: P8) behave.

## Decision drivers

- Exported Markdown pastes cleanly elsewhere (P7 DoD)
- Stored content never depends on the deployment URL (ADR-0011)
- Uploaded files cannot run script in the app's origin
- No extra service, nothing fetched at runtime (ADR-0028)

## Considered options

1. **Editor**: `codemirror` 6 packages with a thin in-house React wrapper (chosen) vs. `@uiw/react-codemirror` (one more wrapper dependency for ~60 lines of code) vs. a textarea (no completion, no syntax colouring).
2. **Code highlighting**: `rehype-highlight` (highlight.js grammars, plugs into `react-markdown`) (chosen) vs. Shiki (WASM + large themes, heavier bundle).
3. **File references in Markdown**: `attachment:<uuid>` scheme, resolved at render and export (chosen) vs. absolute `/work-orchestrator/api/...` URLs (break when `BASE_PATH` changes) vs. relative URLs (depend on the page URL).
4. **SVG**: refuse SVG files holding active content and serve every file with a sandboxing CSP (chosen) vs. a server-side SVG sanitizer dependency vs. refusing SVG altogether (ADR-0027 allows it).

## Decision

- **Dependencies**: frontend `codemirror`, `@codemirror/{view,state,lang-markdown,autocomplete}`, `rehype-highlight`, `mermaid@12` (v11 pulls a vulnerable KaTeX); backend `python-multipart` (FastAPI uploads). All bundled, no CDN.
- **Module** `app/modules/documents`: `Document(owner_id, parent_id?, title, slug unique per owner, content_md, draft_md?, draft_saved_at?, archived_at)`; `DocumentVersion(document_id, number, title, content_md, created_at)` numbered from 1; `DocumentAttachment(document_id, entity_type, entity_id)` (document ↔ entity); `DocumentLink(document_id, target_type, target_id, label)` (wikilinks, rebuilt on each save); `Attachment` (uploaded file, ADR-0027); `DocumentTemplate(name_fr, name_en, content_md)`, instance-wide, seeded with the five ADR-0024 templates (French content, editable).
- **Saves**: `PUT /documents/{id}` creates a version when title or content changes and clears the draft; `PUT /documents/{id}/draft` (autosave, every 2 s of inactivity) creates none; restoring a version creates a new one. A document with children cannot be deleted (archive it); moves refuse cycles (`TREE_CYCLE_DETECTED`).
- **Wikilinks** `[[type:uuid|label]]` with `type ∈ {document, mission, domain, architecture, contact, company, subject, technology}`; ignored inside fenced or inline code; dangling targets allowed (shown as broken). Attaching a document to an entity checks that the entity exists and is visible; types without a module yet return `422 ENTITY_TYPE_NOT_SUPPORTED`. `GET /links/search?q=` feeds the `[[` completion; `GET /backlinks?type=&id=` lists the owner's documents linking to an entity.
- **Files**: `POST /attachments` (multipart), `GET /attachments/{id}`, `DELETE`. Type decided by extension and checked against the content's signature (PNG, JPEG, GIF, WebP, PDF, ZIP-based Office, OLE Office, text). An SVG containing `<script`, `on…=` handlers, `javascript:` or `<foreignObject` is refused. Responses carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, and `Content-Disposition` (`inline` for images and PDF, `attachment` otherwise). Errors: `413 FILE_TOO_LARGE`, `415 FILE_TYPE_NOT_ALLOWED`. Storage under `UPLOADS_DIR/<owner_id>/<uuid>` (`./uploads` in development).
- **Markdown references**: images and files are written `![name](attachment:<uuid>)`; the preview maps them to the API under `BASE_PATH`, the export to absolute URLs. Wikilinks render as in-app links; `/subjects/:id` redirects to the subject's page.
- **Export** (front-end transformer): wikilinks to labels (default) or absolute links; attachments to absolute URLs; optionally each Mermaid block replaced by an SVG image (`data:image/svg+xml;base64`), for tools without Mermaid (Q-I3); copy or download `<slug>.md`.

## Rationale

The CodeMirror wrapper and Shiki add weight for no feature we need. Absolute or relative URLs in
stored Markdown break under another base path. A sanitizer library is a moving target; refusing
active SVG and sandboxing every served file closes the script vector with no dependency.

## Consequences

- **Positive**: clean, portable Markdown; files isolated by owner and unable to run script; no new service
- **Negative**: an exported document's images point to this instance (readers need access to it); the SVG check refuses some harmless files (e.g. with `onload` in a comment); document templates are in French only
- **Follow-ups**: P8 registers `domain` and `architecture` link targets; P10 diff between versions; P11 import and orphan-file cleanup

## Compliance

`tests/unit/test_wikilinks.py`; `tests/integration/test_documents.py` (versions, drafts, tree, links, backlinks, isolation); `tests/integration/test_attachments.py` (size, types, SVG, headers, second user gets 404); frontend `documents.test.tsx` (export transformer, rendering); e2e `documents.spec.ts`.
