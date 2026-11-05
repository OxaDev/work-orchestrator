# Writing ADRs — instructions for LLM agents

You are an agent working on Work Orchestrator. Read this before creating or editing any file in `docs/adr/`.

## 1. Detect that an ADR is needed

Write an ADR **in the same change** as the code when you are about to:

| Trigger | Example |
|---------|---------|
| Add a runtime dependency (Python or npm) that is not a trivial utility | adding `elkjs`, `holidays`, `argon2-cffi` |
| Create, split or merge an entity, or change a cardinality | `Domain` gets several parents |
| Choose a deletion, versioning or ownership strategy | soft delete vs hard delete |
| Implement a business rule enforced across modules | task/half-day compatibility |
| Change auth, cookies, CORS, headers, secrets handling | refresh-token lifetime |
| Change deployment, ports, volumes, Makefile targets semantics | new container |
| Deviate from an existing ADR | anything contradicting an Accepted ADR |
| Pick between two reasonable designs and the user could have chosen otherwise | polling vs SSE |

If unsure, ask yourself: *"Would a developer in six months wonder why?"* If yes, write it.

Not an ADR: bug fixes, refactors without behavioural change, styling, test additions, renames.

## 2. Check existing decisions first

1. Read `docs/adr/README.md` (index).
2. Grep the folder for the topic: `grep -ril "<keyword>" docs/adr/`.
3. If an **Accepted** ADR already covers it, follow it. If your change contradicts it, **stop and ask the user**; never silently deviate.

## 3. Create the file

1. Take the "Next free number" from the README index. Never reuse a number, even from a Rejected ADR.
2. Copy `0000-template.md` to `NNNN-kebab-case-title.md`.
3. Fill every section. Delete the placeholder text in angle brackets; never leave `<...>`.
4. Update the README: add a row to the index **and** increment "Next free number".

## 4. Status: who decides

| Situation | Status to write | Deciders field |
|-----------|-----------------|----------------|
| The user explicitly approved this choice in the conversation | `Accepted` | `Project owner` |
| The user answered "default" / left blank a question whose default you then apply | `Accepted` | `Project owner (default answer)` |
| You chose on your own while implementing | `Proposed` | `<agent name> (pending review)` |
| The user declined | `Rejected` | `Project owner` |

**Never mark your own unilateral choice as `Accepted`.** Tell the user in your final message which ADRs you left as `Proposed`, so they can approve them.

## 5. Writing quality rules

- **Context** states facts and constraints, not the solution.
- **Considered options**: at least two real options. If there truly was only one, say so honestly ("No credible alternative: imposed by constraint X") — do not invent straw men.
- **Decision** is a checkable rule with concrete values: enum members, limits, file paths, versions. "Use a good password policy" is wrong; "min 12 chars, 1 upper, 1 lower, 1 digit, 1 symbol" is right.
- **Rationale** links each rejected option to a driver.
- **Consequences** must contain at least one negative consequence. Every decision has a cost.
- **Compliance** names a test, lint rule or file. Prefer automated checks.
- Keep it short: an ADR is read in 2 minutes. Target 30–80 lines.
- English, plain sentences, no marketing tone.

## 6. Changing a decision

- Do not rewrite an Accepted ADR's Context/Decision/Rationale.
- Create a new ADR with `Supersedes: ADR-XXXX`, then edit only the old ADR's **Status** line to `Superseded by ADR-YYYY` and its index row.
- Small factual additions (benchmarks, observed issues) go into the old ADR's **Notes**, dated.

## 7. Link the decision to the code

- Commit message: reference the ADR, e.g. `feat(auth): rotate refresh tokens (ADR-0007)`.
- Add a one-line comment where the code would otherwise look arbitrary: `# ADR-0020: matrix of allowed subject scopes per half-day kind`.
- If a roadmap ticket implements an ADR, mention it in the ticket line in `docs/02-ROADMAP.md`.
- If the decision changes the scoping document (`docs/00-CADRAGE.md`), update it in the same change.

## 8. Checklist before finishing

- [ ] File named `NNNN-kebab-case-title.md`, number taken from the index
- [ ] All template sections filled, no `<placeholder>` left
- [ ] Status chosen according to section 4
- [ ] At least two options, at least one negative consequence
- [ ] Compliance names something verifiable
- [ ] README index row added and "Next free number" incremented
- [ ] Superseded ADR (if any) status line updated
- [ ] Cadrage / roadmap updated if affected
- [ ] User informed of any `Proposed` ADR

## 9. Minimal example

```markdown
# ADR-0031: Use Server-Sent Events for agenda live refresh

- **Status**: Proposed
- **Date**: 2027-01-12
- **Deciders**: Claude (pending review)
- **Source**: ticket P12-2
- **Tags**: frontend, backend
- **Related**: ADR-0002 · **Supersedes**: none

## Context
Two browser tabs on the agenda show stale data after an edit in the other tab.

## Decision drivers
- No new infrastructure (ADR-0012)
- Works through the reverse proxy (ADR-0011)

## Considered options
1. **Polling every 30 s** — trivial, wasteful, laggy
2. **Server-Sent Events** — one-way stream, native browser support
3. **WebSockets** — bidirectional, needs proxy upgrade configuration

## Decision
We will expose `GET /api/v1/events` as an SSE stream emitting `agenda.changed` events; TanStack Query invalidates the matching queries.

## Rationale
Polling fails the freshness need; WebSockets require extra nginx `Upgrade` config on the user's external proxy.

## Consequences
- Positive: near-instant refresh, no new container
- Negative: one long-lived connection per tab; proxy must not buffer (`proxy_buffering off`)
- Follow-ups: document the nginx directive in OPERATIONS.md

## Compliance
Integration test `tests/integration/test_events.py` asserts an event after a half-day update.
```
