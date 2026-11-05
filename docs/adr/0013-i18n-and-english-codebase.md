# ADR-0013: EN/FR interface, English codebase

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: initial brief; Q-N1 (default answer)
- **Tags**: conventions
- **Related**: ADR-0014 · **Supersedes**: none

## Context

The brief requires code and comments in English and a web interface switchable between English and French.

## Decision drivers

- One language for code, a translatable UI
- Backend errors displayed in the user's language
- Dates and week start follow the locale

## Considered options

1. **Backend returns error codes; frontend translates everything with `react-i18next`**
2. **Backend translates messages based on `Accept-Language`** — two translation catalogues
3. **French-only UI** — contradicts the brief

## Decision

- Code, identifiers, comments, commit messages, ADRs and technical docs: **English**. Scoping documents (`00`–`02`) may stay in French.
- UI: `react-i18next`, namespaces per feature, files `frontend/src/i18n/{en,fr}/<namespace>.json`.
- Backend never returns user-facing prose; it returns `code` + `params` (ADR-0014), translated by the frontend.
- Default locale: `fr`; user preference stored on `User.locale`; weeks start on Monday; dates formatted with `Intl` / `dayjs` per locale.
- Seed data for referentials (sectors, technologies, contact roles) carries `label_en` and `label_fr`.

## Rationale

Option 2 doubles catalogues and splits translation work across two codebases.

## Consequences

- **Positive**: single catalogue, consistent wording
- **Negative**: every new error code needs two translations in the frontend
- **Follow-ups**: test failing on missing keys (P12-4)

## Compliance

Unit test comparing key sets of `en` and `fr`; test asserting every backend error code has a translation.
