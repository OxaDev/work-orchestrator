# ADR-0038: Graph view, Mermaid export and knowledge graph

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P9 (tickets P9-1 to P9-13); Q-H8, Q-H10, Q-H11
- **Tags**: architecture-app, backend, frontend
- **Related**: ADR-0013, ADR-0024, ADR-0025, ADR-0028, ADR-0037 · **Supersedes**: none

## Context

ADR-0025 picks React Flow with ELK for the interactive graph, a server-side Mermaid generator
(`flowchart`, `mindmap`) and stored manual positions. Left open: what "current", "target" and
"both" show (P9-10), the exact Mermaid encoding (shapes, edges, ids, escaping), the language of
edge labels in an exported diagram when the API never returns UI prose (ADR-0013), how syntax is
validated, and what the knowledge graph (P9-12) contains.

## Decision drivers

- The export of a 50-domain architecture renders on GitHub (P9 DoD)
- The same filters in the graph view and the export
- Deterministic output, testable in both stacks

## Considered options

1. **Views**: "current" = CURRENT + DEPRECATED (what runs today), "target" = CURRENT + TARGET (what will run), "both" = all, TARGET marked as added and DEPRECATED as removed (chosen) vs. a strict per-lifecycle filter (a target view without the unchanged domains is meaningless).
2. **Edge labels**: the export takes `lang=fr|en` and writes relation verbs in that language (chosen) vs. raw enum names (`WRITES_TO`, unreadable in a client document) vs. labels sent by the client (every caller re-implements them).
3. **Syntax validation**: backend snapshot files parsed by `mermaid.parse` in a frontend test (chosen) vs. a Mermaid CLI in the backend test suite (Chromium dependency).

## Decision

- **Export** `GET /architectures/{id}/mermaid?format=flowchart|mindmap&direction=LR|TB&depth=&kinds=&view=CURRENT|TARGET|BOTH&lang=fr|en` returns `{format, code}`; generator in `app/modules/architecture/mermaid.py`, fed by the P8 graph builder so filters match the view.
- **flowchart**: a domain with children becomes `subgraph`; leaves get a shape per kind: business domain `(…)`, application `[…]`, service `([…])`, database `[(…)]`, messaging `[[…]]`, external system `{{…}}`, infrastructure `[/…/]`, other `[…]`. Edges `-->` (sync or unknown) or `-.->` (async), labelled with the custom label or the localized verb, plus `(protocol)`. Node ids `d` + first 8 hex digits of SHA-1 of the UUID, lengthened on collision. Labels in quotes; `"`, `<`, `>`, `#` written as Mermaid entity codes; line breaks removed. In "both", `classDef added` (dashed green) and `classDef removed` (grey, dashed) mark lifecycles.
- **mindmap**: the architecture as root, the domain tree below, same ids and escaping.
- **Graph API**: `GraphNode` gains `owner` (org unit summary) for node cards and the team filter. `DomainLayout(architecture_id, domain_id, x, y)`: `GET/PUT/DELETE /architectures/{id}/layout`; a saved position overrides the ELK one.
- **Graph view** (`/architecture/architectures/:id/graph`): React Flow `@xyflow/react@12`, `elkjs@0.10` layered layout with sub-domains as group nodes; collapse a group (its edges then attach to it), filters by kind, team, depth and view, node search, neighbours highlighted; dragging from a node to another opens the relation form; a domain can be created from the graph. Graph shaping is pure code (`graphModel.ts`), unit tested.
- **Export panel**: rendered preview, copy, download `.mmd`, `.svg`, `.png` (canvas, in the browser; nothing leaves the machine, ADR-0028).
- **Knowledge graph** `GET /links/graph`: the owner's non-archived documents and every entity they link to (wikilinks, solid edges) or are attached to (dashed edges); page `/documents/graph` with an ELK `stress` layout.

## Rationale

A strict per-lifecycle filter shows half an architecture in the target view. Raw enum names make
the exported diagram unreadable for a client; client-side labels would differ between callers. A
Mermaid CLI pulls a headless browser into backend CI.

## Consequences

- **Positive**: one filter vocabulary from screen to export; exports readable in French or English; syntax checked with the real Mermaid parser
- **Negative**: the export language is a request parameter, a small exception to "no prose from the API"; GitHub may run an older Mermaid version than the one tested
- **Follow-ups**: P13 C4 export and Mermaid import

## Compliance

`tests/unit/test_mermaid.py` (snapshots in `tests/unit/snapshots/`, 50-domain case), `tests/integration/test_graph_views.py`; frontend `graph.test.tsx` (`graphModel`, `mermaid.parse` of every snapshot); e2e `graph.spec.ts`.
