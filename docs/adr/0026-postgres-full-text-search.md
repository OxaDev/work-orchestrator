# ADR-0026: Full-text search with PostgreSQL

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answer)
- **Source**: Q-K4
- **Tags**: search
- **Related**: ADR-0003 · **Supersedes**: none

## Context

A global `Ctrl+K` search must find missions, contacts, documents, domains, subjects, tasks and daily logs, in French and English content.

## Decision drivers

- No extra service to run
- French stemming and accent-insensitivity
- Good-enough ranking for a few thousand records

## Considered options

1. **PostgreSQL `tsvector` (generated columns) + GIN indexes, `unaccent`, `pg_trgm` for fuzzy names**
2. **Meilisearch / Elasticsearch** — better relevance, another container to sync
3. **`ILIKE` on titles** — no content search

## Decision

- Each searchable table gets a generated `search_vector` column combining a `french` and an `english` configuration over `unaccent`-ed text, weighted (title A, body B), with a GIN index.
- Names (contacts, companies, technologies) also get `pg_trgm` indexes for typo tolerance.
- `GET /api/v1/search?q=&types=` unions per-type queries, ranks with `ts_rank_cd`, returns highlighted snippets (`ts_headline`), scoped to the current owner for personal data (ADR-0010).

## Rationale

A search engine container is disproportionate at this scale; `ILIKE` misses content.

## Consequences

- **Positive**: no sync, transactional freshness
- **Negative**: relevance tuning is limited; bilingual vectors double index size
- **Follow-ups**: P11-1 to P11-3

## Compliance

Integration tests: accent-insensitive and stemmed matches ("migrations" finds "migration"), owner isolation.
