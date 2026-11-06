#!/bin/sh
# Periodic backups from the optional `backup` Compose service (profile "backup", ADR-0040).
# Same layout as backup.sh, so `make restore BACKUP=backups/<stamp>` restores either.
# Runs in the postgres image: PG* variables point at the db service; uploads mounted read-only.
set -eu

INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}
RETENTION=${BACKUP_RETENTION_DAYS:-30}

backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  partial="/backups/$stamp.partial"
  mkdir -p "$partial"
  if pg_dump --format=custom >"$partial/db.dump" \
    && tar -C /data -czf "$partial/uploads.tar.gz" uploads \
    && printf 'created_at=%s\nalembic_revision=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$(psql -Atc 'SELECT version_num FROM alembic_version' || echo unknown)" >"$partial/INFO" \
    && (cd "$partial" && sha256sum db.dump uploads.tar.gz >SHA256SUMS); then
    mv "$partial" "/backups/$stamp"
    echo "Backup written to backups/$stamp"
  else
    echo "Backup failed" >&2
    rm -rf "$partial"
  fi
  if [ "$RETENTION" -gt 0 ]; then
    find /backups -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION" \
      -exec rm -rf {} +
  fi
}

while true; do
  backup
  sleep "$INTERVAL"
done
