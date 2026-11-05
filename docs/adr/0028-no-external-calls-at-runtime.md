# ADR-0028: No external network calls at runtime

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: Q-A3, Q-J3, Q-L4; initial brief (local hosting)
- **Tags**: security
- **Related**: ADR-0011, ADR-0027 · **Supersedes**: none

## Context

The app stores client information (architectures, contacts, notes) that may be confidential. It is hosted locally.

## Decision drivers

- No client data leaves the machine
- App works offline

## Considered options

1. **No outbound call at runtime; all assets bundled**
2. **Allow CDNs and logo/favicon services** — leaks browsing metadata, breaks offline

## Decision

- No CDN: fonts, icons, Mermaid and all JS/CSS are bundled at build time.
- No telemetry, no analytics, no logo fetching (technologies have no remote logos).
- The `holidays` data is shipped with the Python package; no API call.
- Any future feature needing an external call (e.g. an LLM API, Q-L4) requires a new ADR, must be opt-in and off by default.
- Content-Security-Policy restricts sources to `'self'`.

## Rationale

Option 2 contradicts the confidentiality expectation for a minor convenience.

## Consequences

- **Positive**: offline-capable, private by design
- **Negative**: larger front bundle; no automatic logos
- **Follow-ups**: CSP in P12-1

## Compliance

CSP header `default-src 'self'` tested; E2E run with network blocked except the app origin.
