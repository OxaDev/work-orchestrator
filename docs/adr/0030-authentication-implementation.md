# ADR-0030: Authentication implementation details

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: roadmap phase P1 (tickets P1-1 to P1-13)
- **Tags**: security, backend, frontend
- **Related**: ADR-0007, ADR-0008, ADR-0009, ADR-0010, ADR-0011 · **Supersedes**: none

## Context

ADR-0007 fixes the mechanism (short JWT access token, rotating refresh token, httpOnly cookies, lockout after 5 failures). Implementing it raised further choices: where throttling state lives, how to avoid account enumeration, how concurrent tabs refresh, how CSRF is handled, how new routes stay protected.

## Decision drivers

- No account enumeration through login responses or lockout
- Revocation must take effect immediately (deactivation, password change)
- Several tabs must not log each other out
- Forgetting to protect a new endpoint must be impossible to miss

## Considered options

1. **Throttling per normalised e-mail in a dedicated table** (chosen) vs. counters on `User` (reveals which e-mails exist once locked) vs. per-IP limits (meaningless behind the reverse proxy, spoofable headers).
2. **Refresh race: 30 s grace returning 409 without revocation** (chosen) vs. strict reuse detection (two tabs log the user out) vs. no reuse detection (theft undetected).
3. **CSRF: `SameSite=Strict` cookies + JSON-only API** (chosen) vs. double-submit CSRF token (more code, no added protection for a same-origin SPA).
4. **Protected by default** (chosen) vs. a dependency added per route.

## Decision

- **Default protection**: every router is mounted behind `get_current_user` except `PUBLIC_ROUTERS` in `app/main.py` (health, login, refresh, logout). A test enumerates all OpenAPI operations and asserts 401 `AUTH_REQUIRED` for every non-public one. Adding a public route requires updating that list and this ADR.
- **Cookies**: `wo_access` (Path = `BASE_PATH` or `/`) and `wo_refresh` (Path = `BASE_PATH/api/v1/auth`, so it is only sent to auth endpoints). Both `HttpOnly`, `SameSite=Strict`, `Secure` unless `COOKIE_SECURE=false` or not in production. No CSRF token.
- **Per-request user load**: the access token only carries `sub`, `iat`, `exp`, `type`. The user is loaded on each request; inactive users are rejected immediately; tokens with `iat` earlier than `password_changed_at` (second precision) are rejected.
- **Login throttling**: table `login_throttles(email, failed_count, locked_until)`, keyed by the normalised e-mail whether or not an account exists. 5 failures → locked 15 min → `429 TOO_MANY_LOGIN_ATTEMPTS` with `params.retryAfterSeconds`. Bad e-mail, bad password and inactive account all return the same `401 INVALID_CREDENTIALS`; unknown e-mails still run an Argon2 verification against a dummy hash to equalise timing.
- **Refresh rotation**: each login starts a token family. Presenting a token already rotated less than 30 s ago returns `409 REFRESH_TOKEN_ALREADY_ROTATED` (another tab won the race; the shared cookie jar already holds the new token). Older replays revoke the whole family. A failed refresh clears both cookies.
- **Frontend**: the API client renews the session once for all concurrent callers (single flight), treats 409 as success, replays the original request once, and emits `expired` otherwise; the router guard then sends the user to `/login?next=<path>` (relative paths only, open redirects refused).
- **Revocations**: own password change revokes every session and issues fresh tokens for the current one; admin reset and deactivation revoke all sessions of the target user. The last active administrator cannot be demoted or deactivated (`409 LAST_ADMIN`).
- **Clock**: all time checks use `app.core.clock.utcnow` (patchable in tests); PyJWT's own `exp`/`iat` checks are disabled and done explicitly.
- **Accounts tooling**: `app.cli create-admin [--skip-if-exists]` and `reset-password`; the password comes from a TTY prompt or `WO_PASSWORD`.

## Rationale

Per-account counters let an attacker learn which e-mails exist by triggering lockouts. Per-IP limits see only the proxy address. Strict reuse detection breaks the common multi-tab case. A CSRF token adds nothing when cookies are `SameSite=Strict` and the API only accepts JSON from the same origin.

## Consequences

- **Positive**: immediate revocation, no enumeration, multi-tab safe, new endpoints protected unless deliberately public
- **Negative**: one extra DB read per request; an attacker can lock a known e-mail for 15 min (accepted for a personal instance); the 30 s grace slightly widens the replay window
- **Follow-ups**: purge job for expired refresh tokens and stale throttles (P12)

## Compliance

`tests/integration/test_route_protection.py`, `test_auth.py` (lockout, rotation, replay, cookies), `test_me.py`, `test_users.py`; frontend `auth.test.tsx`; e2e `auth.spec.ts` (cookie attributes under the base path).
