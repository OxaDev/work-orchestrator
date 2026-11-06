#!/usr/bin/env bash
# Backs up the database and the uploads together (ADR-0027, ADR-0040).
#
#   scripts/backup.sh  ->  backups/<YYYYMMDD-HHMMSS>/{db.dump,uploads.tar.gz,INFO,SHA256SUMS}
#
# Runs pg_dump and tar inside the stack's containers: no PostgreSQL client on the host, and
# the dump always matches the server version. Environment:
#   COMPOSE                 compose command (default "docker compose"; the e2e stack:
#                           "docker compose -p work-orchestrator-e2e")
#   BACKUP_DIR              destination root (default "backups")
#   BACKUP_RETENTION_DAYS   sets older than this are deleted (default 30; 0 keeps everything)
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose}
ROOT=${BACKUP_DIR:-backups}
RETENTION=${BACKUP_RETENTION_DAYS:-30}
stamp=$(date +%Y%m%d-%H%M%S)
target="$ROOT/$stamp"
partial="$target.partial"

checksum() {
  if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

mkdir -p "$partial"
trap 'rm -rf "$partial"' ERR

echo "Dumping the database..."
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  >"$partial/db.dump"

echo "Archiving the uploads..."
$COMPOSE exec -T backend tar -C /data -czf - uploads >"$partial/uploads.tar.gz"

revision=$($COMPOSE exec -T backend alembic current 2>/dev/null | awk 'NR==1 {print $1}')
printf 'created_at=%s\nalembic_revision=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "${revision:-unknown}" >"$partial/INFO"
(cd "$partial" && checksum db.dump uploads.tar.gz >SHA256SUMS)
mv "$partial" "$target"
trap - ERR
echo "Backup written to $target"

if [ "$RETENTION" -gt 0 ]; then
  find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9][0-9][0-9][0-9][0-9]-*' \
    -mtime +"$RETENTION" -print -exec rm -rf {} +
fi
