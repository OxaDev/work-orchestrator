# ADR-0043: Live Markdown editor (TipTap) superseding the CodeMirror-only editor

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Project owner
- **Source**: conversation 2026-11-17 ("édition en aperçu live, comme Notion", commands on "/"); roadmap P13-13; Q-I2
- **Tags**: documents, frontend
- **Related**: ADR-0024, ADR-0028, ADR-0036, ADR-0042 · **Supersedes**: ADR-0036 (editor choice only), ADR-0024 ("WYSIWYG editing is out of V1")

## Context

Documents are edited in a CodeMirror source editor with a side-by-side preview (ADR-0036). The owner
wants Notion-like editing in the rendered page, with a "/" menu for blocks and links, and finds
Markdown syntax marks unreadable in the dark scheme. Markdown stays the stored format (ADR-0024):
wikilinks feed backlinks, `attachment:<uuid>` references files, ```` ```mermaid ```` blocks are diagrams,
and documents are pasted into client tools.

## Decision drivers

- Markdown remains the only stored format; a document must survive load and save unchanged
- Wikilinks, attachments and Mermaid keep working in the new editor
- Bundled, MIT-compatible, no runtime network call (ADR-0028)
- Raw Markdown stays reachable for power edits

## Considered options

1. **TipTap 3 (ProseMirror) + official `@tiptap/markdown`, CodeMirror kept as a source mode**
2. **TipTap only** — remove CodeMirror and the preview
3. **Milkdown** — Markdown-native (remark), smaller ecosystem, less mature slash-menu plugins
4. **BlockNote** — Notion clone, but block JSON first and lossy Markdown conversion

## Decision

- **Dependencies** (frontend, exact `3.32.2`): `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`,
  `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-code-block`,
  `@tiptap/extension-image`, `@tiptap/extension-list`, `@tiptap/extension-table`,
  `@tiptap/extensions`, `@tiptap/suggestion`; plus `@codemirror/language` and `@lezer/highlight`
  made explicit for the source-mode colours. All bundled; the live editor is lazy-loaded with the
  document page's first editor (`React.lazy`).
- **Document page modes**: `live` (default, `features/documents/LiveEditor.tsx`), `source` (the
  CodeMirror `MarkdownEditor`), `preview` (read-only `MarkdownView`). The side-by-side mode is removed.
  All modes edit the same Markdown string; autosave, drafts, versions and Ctrl/Cmd+S are unchanged.
- **Schema** (`features/documents/live/extensions.ts`): StarterKit (code block replaced), task
  lists, tables, inline images, plus:
  - `wikilink` inline atom node (`live/wikilink.ts`), parsed with the same regular expression as
    `components/markdown.ts` and written back as `[[type:uuid|label]]` (no `|label` when the source
    had none); Ctrl/Cmd+click opens the target.
  - images keep `src="attachment:<uuid>"` in the document and display through the API URL;
    links accept the `attachment:` scheme.
  - code blocks render through a React node view; a `mermaid` block shows the diagram under its
    editable source.
- **Commands**: "/" opens a filtered, keyboard-driven menu (paragraph, headings 1–3, bulleted,
  numbered and task lists, quote, code block, Mermaid, table, divider, link to a document, link to
  any entity, file). "[[" opens the entity search (`GET /links/search`); "link to a document"
  restricts it to documents. Pasting an app URL `…/documents/<uuid>` inserts a wikilink to that
  document. Pasted or dropped files are uploaded as before.
- **Source mode colours**: a `HighlightStyle` on Mantine CSS variables (`--mantine-color-*-text`)
  and an `EditorView.theme(…, { dark })` reconfigured from `useComputedColorScheme`.

## Rationale

- Option 2 removes the only lossless way to fix Markdown the live schema does not model (raw HTML,
  footnotes) and contradicts the "source of truth" driver.
- Option 3: round-trip would be the most faithful, but the slash menu, tables and node views would
  be home-made; TipTap ships `@tiptap/suggestion`, tables and an official Markdown manager.
- Option 4 stores blocks, not Markdown; its Markdown export is documented as lossy.

## Consequences

- **Positive**: Notion-like editing on the real Markdown; links and diagrams visible while writing;
  readable source mode in dark scheme.
- **Negative**: a lazily loaded chunk of about 650 kB minified (180 kB gzipped, measured
  2026-11-17) on the document page; Markdown the schema
  does not model is normalised on the first edit in live mode (table padding, `*` vs `_`, escaped
  `[`); raw HTML and footnotes are dropped by the live mode — use the source mode for those documents.
  Eleven `@tiptap/*` packages must be upgraded together (exact versions).
- **Follow-ups**: P13-10 (visual diff between versions) helps spot normalisation; consider an
  "unsupported content" warning before switching such a document to live mode.

## Compliance

`frontend/src/features/documents/LiveEditor.test.tsx` (Markdown round-trip of headings, emphasis,
lists, task lists, code, Mermaid, table, attachments, wikilinks; slash menu; `[[` search; outside
changes); `MarkdownEditor.test.tsx` (dark theme facet); `documents.test.tsx` (modes, sub-document).

## Notes

- 2026-11-17: `@tiptap/*` pinned to 3.32.2, the latest release older than two weeks on that date.
