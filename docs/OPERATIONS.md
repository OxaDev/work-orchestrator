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

## Backups and restore (ADR-0027, ADR-0040)

Database and uploads are always saved and restored **together**. The scripts run `pg_dump` and
`tar` inside the stack's containers: the host needs only Docker Compose, and the dump always
matches the server's PostgreSQL version.

### Back up

```bash
make backup            # -> backups/<YYYYMMDD-HHMMSS>/
```

Each set holds `db.dump` (`pg_dump --format=custom`), `uploads.tar.gz`, `INFO` (date, Alembic
revision) and `SHA256SUMS`. Sets older than `BACKUP_RETENTION_DAYS` (default 30, `0` keeps all)
are deleted. `backups/` is git-ignored: copy it off the machine (another disk, a NAS, ...).

Daily backups without cron: `make backup-service` starts the optional `backup` service (Compose
profile `backup`), which writes the same sets into `./backups` every `BACKUP_INTERVAL_SECONDS`
(default 86400, first set at start). Stop it with `docker compose --profile backup stop backup`.

### Restore

```bash
make restore BACKUP=backups/20261106-145951
```

The script checks the checksums, asks you to type the set's name, stops the backend, restores the
dump in a single transaction (`pg_restore --clean --if-exists`), replaces the whole uploads
volume, restarts the backend and runs `alembic upgrade head` (a set from an older version is
brought up to date). Every current data is replaced; sessions too, so users sign in again.
`YES=1` skips the prompt (scripts).

### On a new machine

1. Install Docker (with Compose), clone the repository, copy the backup set into `backups/`.
2. `make env`, then put the **same** `SECRET_KEY` as the old `.env` if you have it (otherwise
   only the sessions are lost).
3. `make deploy` (builds, starts, migrates, creates an empty admin if none).
4. `make restore BACKUP=backups/<set>`.
5. Sign in with an account of the restored instance; check the agenda, a document with an image
   and the search (`Ctrl+K`).

### Drill (done for P11 on the e2e stack)

```bash
make test-e2e   # leaves the e2e stack running on 127.0.0.1:18081
export APP_PORT=18081 BASE_PATH=/work-orchestrator
make backup  COMPOSE="docker compose -p work-orchestrator-e2e" BACKUP_DIR=/tmp/drill
# create something in the app, then:
make restore COMPOSE="docker compose -p work-orchestrator-e2e" BACKUP=/tmp/drill/<set> YES=1
```

Checked: data created after the backup is gone, document and file counts are back, attachments
download, search works (generated search columns come back with the dump).

### Per-user archive (not a backup)

Settings > Data exports one user's data as a zip (`GET /export`) and imports it into an account
holding no data (`POST /import`, up to 200 MB). Ids are kept, so an archive goes to **another**
instance (or after the original rows are gone); the same instance answers `IMPORT_CONFLICT`. Use
`make backup` / `make restore` for the whole instance.
