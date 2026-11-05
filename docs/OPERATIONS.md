# Operations

## Ports and processes

| What | Where | Notes |
|------|-------|-------|
| Application (Docker) | `127.0.0.1:${APP_PORT}` (default **18080**) | Only published port of the stack (ADR-0011, ADR-0012) |
| Backend (Docker) | `backend:8000`, internal network only | Reached through the frontend nginx |
| Database (Docker) | `db:5432`, internal network only | Not published by `make deploy` |
| Dev database | `127.0.0.1:${POSTGRES_PORT}` (default **55432**) | Published only by `docker-compose.dev.yml` (`make dev`, `make test-back`) |
| Dev backend / frontend | `127.0.0.1:8000` / `127.0.0.1:5173` | `make dev`, run on the host with hot reload |

Defaults avoid the common 5432/5433/8080 ports. Change them in `.env` if they clash.

## External reverse proxy (HTTPS, sub-path)

The application is served under `BASE_PATH` (default `/work-orchestrator`). Your external nginx terminates TLS and forwards the path **unchanged**:

```nginx
# Inside the server { listen 443 ssl; server_name <dns>; ... } block
location = /work-orchestrator { return 301 /work-orchestrator/; }

location /work-orchestrator/ {
    proxy_pass http://127.0.0.1:18080;   # no trailing slash: keep the prefix
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    client_max_body_size 25m;           # attachments (ADR-0027)
}
```

Changing `BASE_PATH` requires a rebuild (`make deploy`): it is baked into the frontend build.

## Accounts

There is no public sign-up (ADR-0009).

```bash
make create-admin                         # deployed stack: create an administrator (interactive)
make reset-password email=you@example.com # deployed stack: forgotten password; revokes all sessions
make create-admin-dev                     # same, development database
make reset-password-dev email=...
```

`make deploy` offers to create the first administrator when none exists. Other accounts are managed in **Settings → Users** by an administrator. After 5 failed sign-ins an e-mail is locked for 15 minutes.

## Reference and demo data

- `seed-reference` loads sectors and the technology catalogue. It is idempotent and never changes existing rows; `make init`, `make deploy` and `make test-e2e` run it.
- `make seed` adds fictional demo companies and contacts to the **development** database only (refused in production).

## Compose projects

| Project | Used by | Data |
|---------|---------|------|
| `work-orchestrator` | `make deploy`, `make down` | real data (volumes `work-orchestrator_pgdata`, `_uploads`) |
| `work-orchestrator-dev` | `make db-up`, `make dev`, `make test-back`, `make dev-down` | development database on `127.0.0.1:55432` |
| `work-orchestrator-e2e` | `make test-e2e`, `make e2e-down` | throw-away stack on `127.0.0.1:18081` with admin `e2e-admin@example.com` |

## Deploy / update

```bash
git pull
make deploy      # rebuilds images, restarts containers, applies migrations
make ps          # status and health
make logs        # follow logs
```

Data lives in the Docker volumes `work-orchestrator_pgdata` and `work-orchestrator_uploads`; `make down` keeps them.

## Backups

`make backup` / `make restore` arrive in roadmap phase P11 (ADR-0027: always restore database and uploads together).
