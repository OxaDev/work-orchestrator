# ADR-0022: Trees with a single parent + typed relations for graphs

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: Q-G4, Q-H4, Q-H5, Q-H7, Q-C3, Q-C5
- **Tags**: data
- **Related**: ADR-0003, ADR-0023 · **Supersedes**: none

## Context

Several hierarchies have unlimited depth: domains, subjects, org units, sectors, companies (subsidiaries), documents. Domains are also connected by non-hierarchical relations (calls, depends on…).

## Decision drivers

- Unlimited depth, cheap moves of whole subtrees
- Clear separation between "is part of" and "interacts with"
- Queries in PostgreSQL only (ADR-0003)

## Considered options

1. **Adjacency list (`parent_id`) + recursive CTEs; separate relation table for graph edges**
2. **Materialized path / `ltree`** — fast subtree reads, subtree moves rewrite all descendants
3. **Multiple parents (DAG)** — expressive, ambiguous ownership and display

## Decision

- Every hierarchy uses a nullable self-referencing `parent_id` with a single parent.
- Cycle prevention in the service layer before any parent change (`TREE_CYCLE_DETECTED`), plus a check `parent_id <> id`.
- Ancestors/descendants via recursive CTEs, implemented once in `app/shared/tree.py`.
- Domain relations live in `DomainRelation(source_id, target_id, type, label, protocol, sync_mode, lifecycle)` with `type ∈ {CALLS, DEPENDS_ON, PUBLISHES_TO, SUBSCRIBES_TO, READS_FROM, WRITES_TO, CUSTOM}`; `label` required when `CUSTOM`; `sync_mode ∈ {SYNC, ASYNC}`; self-relations forbidden.
- Org unit levels are free labels (direction, pôle, équipe, tribe, squad…). Sectors default to two levels but are not technically limited.

## Rationale

`ltree` makes moves expensive and couples IDs to paths. DAG hierarchy breaks the simple "owned by" reading and graph layout.

## Consequences

- **Positive**: one generic tree helper reused everywhere
- **Negative**: deep subtree reads cost a recursive query (acceptable at our scale)
- **Follow-ups**: performance test with ≥ 10 levels (P8-12)

## Compliance

Unit tests on `tree.py` (cycle, move, depth); tests `test_rg08_*`, `test_rg09_*`.
