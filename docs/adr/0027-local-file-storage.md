# ADR-0027: Attachments stored on a local volume

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answer)
- **Source**: Q-I4
- **Tags**: data
- **Related**: ADR-0024, ADR-0028 · **Supersedes**: none

## Context

Documents include pasted screenshots and attached files (PDF…). Hosting is local, without object storage.

## Decision drivers

- Local only, no cloud storage
- Access control identical to the owning document
- Included in backups

## Considered options

1. **Files on a Docker volume, metadata in PostgreSQL, served by the backend**
2. **Files as `bytea` in PostgreSQL** — single backup, bloats the database
3. **MinIO (S3-compatible) container** — extra service

## Decision

- Files stored in volume `uploads` under `<owner_id>/<uuid>`, never under their original name.
- `Attachment(owner_id, document_id?, filename, mime_type, size, sha256, created_at)`.
- Limits: 20 MB per file; allowed types: images (png, jpeg, gif, webp, svg sanitized), pdf, txt, md, csv, office documents.
- Served only by the backend at `/api/v1/attachments/{id}` after ownership check, with `Content-Disposition` and `X-Content-Type-Options: nosniff`.
- `make backup` archives the volume together with the database dump.

## Rationale

`bytea` bloats dumps and memory; MinIO is unjustified for one user.

## Consequences

- **Positive**: simple, fast, isolated by owner
- **Negative**: DB and volume can diverge if restored separately — always restore both
- **Follow-ups**: P7-5, P11-8; orphan file cleanup job later

## Compliance

Tests: oversize and forbidden types rejected; second user gets 404.
