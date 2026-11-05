# ADR-0008: Password policy

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-B5
- **Tags**: security
- **Related**: ADR-0007 · **Supersedes**: none

## Context

The owner asked for: at least 12 characters, one digit, one symbol, one uppercase, one lowercase letter, and explicitly no "annoying" symbol requirement such as the caret (`^`), which is a dead key on French AZERTY keyboards.

## Decision drivers

- Owner's explicit rules
- Never force characters that are awkward to type on AZERTY (`^`, `¨`, `` ` ``, `~`)

## Considered options

1. **Composition rules as requested, any non-alphanumeric character counts as a symbol**
2. **Composition rules with a restricted allowed-symbol list** — risks rejecting passwords from a password manager
3. **Length-only policy (NIST style)** — contradicts the owner's request

## Decision

A password is valid when all of these hold:

- length ≥ 12 (max 128)
- ≥ 1 uppercase letter, ≥ 1 lowercase letter, ≥ 1 digit
- ≥ 1 symbol, where a symbol is **any** printable non-alphanumeric character

No specific symbol is ever required. The UI hint lists easy AZERTY symbols as examples: `! @ # $ % & * - _ + = . , ; : ? /`. Rules are implemented once in the backend (`app/modules/auth/password_policy.py`) and mirrored in the frontend for live feedback; the backend is authoritative. Error codes: `PASSWORD_TOO_SHORT`, `PASSWORD_MISSING_UPPERCASE`, `PASSWORD_MISSING_LOWERCASE`, `PASSWORD_MISSING_DIGIT`, `PASSWORD_MISSING_SYMBOL`.

## Rationale

Option 2 would reject valid manager-generated passwords. Option 3 ignores the request.

## Consequences

- **Positive**: matches the owner's expectation, AZERTY-friendly
- **Negative**: composition rules are weaker than length-only guidance per NIST; rule duplicated front/back
- **Follow-ups**: none

## Compliance

Parametrised unit tests on the policy function; frontend test on the live checklist.

## Notes

"Pas relou genre le chapeau" interpreted as "never require a dead-key character". If the intent was to forbid such characters, supersede this ADR.
