# ADR-0011: Served behind a reverse proxy under a sub-path

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-A2
- **Tags**: deployment
- **Related**: ADR-0007, ADR-0012 · **Supersedes**: none

## Context

The owner runs an external nginx that terminates HTTPS and forwards `https://<dns>/work-orchestrator` to `http://localhost:<app port>`. The app must work under that sub-path, and also at `/` for local development.

## Decision drivers

- Deep links (`/work-orchestrator/agenda/2026/11`) must survive a page refresh
- Cookies scoped to the app, `Secure` behind HTTPS
- Correct scheme and host in redirects and OpenAPI docs
- Minimal configuration on the external nginx

## Considered options

1. **App is prefix-aware; external proxy forwards the path unchanged**
2. **External proxy strips the prefix; app thinks it lives at `/`** — assets and links break unless the app still knows the public prefix
3. **Dedicated sub-domain instead of sub-path** — not what the owner has

## Decision

- Single setting `BASE_PATH` (default `/work-orchestrator`, `/` allowed), in `.env`.
- Frontend: built with Vite `base = BASE_PATH + "/"` (Docker build arg); React Router `basename` and API base URL derived from `import.meta.env.BASE_URL`. Base path is therefore a **build-time** value: changing it requires `make deploy` (rebuild).
- Frontend container nginx serves the SPA under `BASE_PATH/` with SPA fallback, and proxies `BASE_PATH/api/` to the backend.
- Backend: routes under `/api/v1`; FastAPI `root_path=BASE_PATH`; uvicorn `--proxy-headers --forwarded-allow-ips=*` (only the internal network reaches it).
- Auth cookies: `Path=BASE_PATH`, `Secure=true` in production.
- The app container publishes its port on `127.0.0.1` only (default `127.0.0.1:8080`); the external nginx is the only public entry.
- External nginx: `location /work-orchestrator/ { proxy_pass http://127.0.0.1:8080; }` plus `X-Forwarded-Proto/For/Host` headers. A full snippet lives in `docs/OPERATIONS.md`.

## Rationale

Option 2 still needs the app to know the public prefix for asset URLs, so stripping only adds a mismatch. Option 3 is not available.

## Consequences

- **Positive**: same image works locally and behind the proxy; no prefix rewriting in the external nginx
- **Negative**: base path baked into the front build; every hard-coded `/` link is a bug
- **Follow-ups**: P0 tickets for `BASE_PATH`; E2E suite runs once with `BASE_PATH=/work-orchestrator`

## Compliance

E2E test under the sub-path: login, deep-link refresh, asset loading, cookie path. ESLint rule or review: no absolute `href="/..."` in the frontend.

## Notes

- 2026-11-05 (P0): FastAPI deprecated the `root_path` constructor argument. The prefix is passed to the server instead (`uvicorn --root-path "$BASE_PATH"` in the backend image); behaviour is unchanged. The frontend nginx strips `BASE_PATH` before proxying, so backend routes always start at `/api`.
