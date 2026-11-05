# ADR-0003: PostgreSQL as the single datastore

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-M1
- **Tags**: data
- **Related**: ADR-0022, ADR-0026 · **Supersedes**: none

## Context

The data model contains deep trees (domains, subjects, org units), a graph (domain relations, wikilinks), and free text to search in French and English.

## Decision drivers

- Recursive queries over trees and graphs
- Full-text search in FR and EN
- Simple backup and restore
- Runs in Docker Compose locally

## Considered options

1. **PostgreSQL 17** — recursive CTEs, `tsvector` with language dictionaries, JSONB
2. **SQLite** — single file, trivial backup, weaker full-text and concurrency
3. **PostgreSQL + a graph database (Neo4j)** — native graph queries, second store to operate

## Decision

We will use PostgreSQL 17 (official image) as the only datastore. Trees and graphs are stored relationally and queried with recursive CTEs. No graph database.

## Rationale

SQLite's FTS5 lacks French stemming out of the box. A graph database is overkill for a few thousand nodes and doubles backup and consistency concerns.

## Consequences

- **Positive**: one store, transactional consistency, mature tooling (`pg_dump`)
- **Negative**: a database container to run even for one user; tests need a real Postgres
- **Follow-ups**: test database fixture (P0-12), backup targets (P11-8)

## Compliance

`docker-compose.yml` defines a single database service; integration tests run against PostgreSQL, never SQLite.
