# ADR-0009: Admin-only account provisioning

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: Q-B1, Q-B4
- **Tags**: security
- **Related**: ADR-0007, ADR-0010 · **Supersedes**: none

## Context

The instance is personal but reachable over HTTPS (ADR-0011). There is no mail server, so no self-service password reset by email.

## Decision drivers

- No open sign-up on an internet-reachable instance
- Recovery possible without email

## Considered options

1. **Bootstrap admin via CLI; further accounts created by admin; reset by admin or CLI**
2. **Open sign-up** — anyone reaching the URL can create an account
3. **Email-based reset** — requires SMTP configuration

## Decision

- `make init` runs `create-admin` (interactive email + password, policy of ADR-0008).
- No public registration endpoint. Admins create, deactivate and reset users.
- `make reset-password email=...` resets any password from the host shell.
- Roles: `admin`, `user`.

## Rationale

Open sign-up is a risk on an exposed URL. SMTP adds configuration for a single user.

## Consequences

- **Positive**: closed by default, recovery always possible from the host
- **Negative**: a forgotten password needs shell access to the host
- **Follow-ups**: P1-8, P1-10

## Compliance

No route under `/auth` creates users; test asserts `POST /api/v1/users` requires `admin`.
