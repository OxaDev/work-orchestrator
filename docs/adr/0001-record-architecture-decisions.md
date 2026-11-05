# ADR-0001: Record architecture decisions

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: conversation 2026-11-05 ("keep an ADR folder for all decisions, now and in the future")
- **Tags**: process
- **Related**: none · **Supersedes**: none

## Context

The project is built over many sessions, largely by LLM agents, with a single human owner. Without a written trail, the reasons behind choices are lost between sessions and agents re-open settled questions or silently contradict them.

## Decision drivers

- Agents start each session without memory of earlier reasoning
- The owner must be able to audit and overrule choices quickly
- Low ceremony: writing an ADR must take minutes

## Considered options

1. **ADRs in `docs/adr/`, MADR-inspired template** — versioned with the code
2. **Decisions section in the scoping document** — one file, grows unreadable, no lifecycle
3. **No formal record** — rely on commit messages

## Decision

We will record every structuring decision as a Markdown ADR in `docs/adr/`, using `0000-template.md`, numbered sequentially, indexed in `README.md`, with the lifecycle Proposed → Accepted/Rejected → Deprecated/Superseded. Agents follow `LLM-INSTRUCTIONS.md`. Agents may only write `Accepted` when the owner approved the choice.

## Rationale

Option 2 mixes requirements and decisions and loses history. Option 3 scatters reasons across commits nobody reads.

## Consequences

- **Positive**: decisions are discoverable, reviewable, and survive across sessions
- **Negative**: extra writing on every structuring change; index must be kept in sync by hand
- **Follow-ups**: P0 ticket for a `make adr-new` helper and an index consistency check

## Compliance

Review checklist: any PR adding a dependency, entity, or cross-module rule contains a new or referenced ADR. `CLAUDE.md` instructs agents to apply this.
