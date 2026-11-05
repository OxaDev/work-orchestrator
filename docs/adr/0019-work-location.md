# ADR-0019: Work location per half-day

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-E5, Q-F1
- **Tags**: domain
- **Related**: ADR-0018 · **Supersedes**: none

## Context

The owner wants to know, per half-day, where the work happened, with six distinct cases.

## Decision drivers

- The owner's six explicit categories
- Usable in statistics and week templates

## Considered options

1. **Fixed enum with the six requested values**
2. **User-editable list** — flexible, statistics lose stable keys
3. **Two fields (mode + place)** — more precise, heavier input

## Decision

Optional field `HalfDay.location` (also on `WeekTemplateSlot`) with enum:

| Value | Meaning (FR) |
|-------|--------------|
| `CLIENT_ON_SITE` | Sur site chez le client |
| `REMOTE_ESN_OFFICE` | Télétravail depuis les locaux de l'ESN |
| `REMOTE_HOME` | Télétravail depuis la maison |
| `REMOTE_OTHER` | Télétravail depuis un autre lieu |
| `TRAVEL_MISSION` | Déplacement pour la mission |
| `TRAVEL_ESN` | Déplacement pour l'ESN |

Location is meaningful for `MISSION`, `INTERCONTRACT` and `TRAINING`; it must be null for `LEAVE`, `PUBLIC_HOLIDAY`, `SICK_LEAVE`, `OFF`.

## Rationale

The owner gave an exact list; option 2 and 3 add flexibility nobody asked for.

## Consequences

- **Positive**: stable statistics (days on site, remote ratio)
- **Negative**: adding a value needs a migration
- **Follow-ups**: P4-1, P6-1, statistics in P4-5

## Compliance

DB enum type; test rejecting a location on a LEAVE half-day.
