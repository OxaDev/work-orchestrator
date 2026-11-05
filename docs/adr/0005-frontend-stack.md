# ADR-0005: Frontend stack — React, TypeScript, Vite, TanStack Query

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: initial brief (React) + Q-M2 (TypeScript)
- **Tags**: frontend
- **Related**: ADR-0006, ADR-0015 · **Supersedes**: none

## Context

The brief imposes ReactJS. Remaining choices: language, build tool, routing, server-state management.

## Decision drivers

- Type safety shared with the backend contract
- Fast dev loop
- Server state (lists, caches, invalidation) is the bulk of the app's state

## Considered options

1. **React + TypeScript + Vite + React Router + TanStack Query**
2. **Next.js** — SSR and file routing; needs a Node server, unnecessary here
3. **React + JavaScript + Redux** — no types, boilerplate for server state

## Decision

We will use React 19, TypeScript in `strict` mode, Vite, React Router (data router), TanStack Query for all server state, and local React state or small Zustand stores only for pure UI state. Node 22 LTS. ESLint + Prettier.

## Rationale

Next.js brings a Node server to deploy and conflicts with the static nginx container (ADR-0012). Redux duplicates what TanStack Query handles (caching, invalidation).

## Consequences

- **Positive**: compile-time safety, standard ecosystem
- **Negative**: TypeScript strictness slows early prototyping
- **Follow-ups**: generated API types (ADR-0015)

## Compliance

`tsconfig.json` has `"strict": true`; `make typecheck` runs `tsc --noEmit`.

## Notes

- 2026-11-05 (P0): TypeScript pinned to `~5.9` because `openapi-typescript` 7 requires TS 5 and `typescript-eslint` 8 rejects TS ≥ 6.1. Revisit when both support newer TypeScript. Installed majors at P0: React 19, React Router 8, Vite 8, Vitest 5, MSW 3, ESLint 10.
