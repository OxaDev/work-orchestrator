# ADR-0007: Home-made authentication with JWT and rotating refresh tokens

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (B2, B3 default answers)
- **Source**: initial brief ("home-made auth, no 2FA"), Q-B2, Q-B3
- **Tags**: security
- **Related**: ADR-0008, ADR-0009, ADR-0011 · **Supersedes**: none

## Context

The brief requires a home-made authentication system without 2FA. The app is exposed over HTTPS through the owner's reverse proxy (ADR-0011), so it may be reachable beyond localhost.

## Decision drivers

- No third-party identity provider
- Revocable sessions
- Tokens not readable by JavaScript (XSS mitigation)

## Considered options

1. **Short JWT access token + opaque refresh token stored hashed in DB, both in httpOnly cookies**
2. **Server-side sessions only** (session id cookie, session table)
3. **JWT in localStorage** — exposed to XSS

## Decision

- Login identifier: email.
- Passwords hashed with **Argon2id** (`argon2-cffi`), rehash on parameter change.
- Access token: JWT HS256, 15 minutes, cookie `access_token`.
- Refresh token: 256-bit random, stored as SHA-256 hash in `refresh_tokens`, 30 days, rotated on every use; reuse of a rotated token revokes the whole token family.
- Cookies: `HttpOnly`, `SameSite=Strict`, `Secure` when `COOKIE_SECURE=true` (default in production), `Path` = application base path (ADR-0011).
- Brute-force protection: 5 failed logins → account locked 15 minutes; generic error message.
- No 2FA, no OAuth.

## Rationale

Option 2 is equally valid but option 1 keeps most requests DB-free for auth while preserving revocation via refresh tokens. Option 3 is unsafe.

## Consequences

- **Positive**: revocable, XSS-resistant, no external dependency
- **Negative**: we own security-sensitive code; access token stays valid up to 15 min after logout
- **Follow-ups**: security tests in P1-13, review in P12-1

## Compliance

Integration tests: expired token, refresh reuse detection, lockout, cookie flags asserted on login response.
