#!/usr/bin/env bash
# Restores a backup made by backup.sh or the backup service: database and uploads together
# (ADR-0027, ADR-0040).
#
#   scripts/restore.sh backups/<YYYYMMDD-HHMMSS>
#
# Replaces ALL current data. Checks the checksums, stops the backend, restores the dump in one
# transaction, replaces the uploads volume, restarts the backend and applies migrations (a
# backup from an older version is brought up to date).
# Environment: COMPOSE (see backup.sh); YES=1 skips the confirmation prompt.
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose}
source_dir=${1:?usage: scripts/restore.sh backups/<YYYYMMDD-HHMMSS>}
source_dir=${source_dir%/}

verify() {
  if command -v sha256sum >/dev/null; then sha256sum -c SHA256SUMS; else shasum -a 256 -c SHA256SUMS; fi
}

for file in db.dump uploads.tar.gz SHA256SUMS; do
  [ -f "$source_dir/$file" ] || { echo "Missing $source_dir/$file" >&2; exit 1; }
done
echo "Checking integrity..."
(cd "$source_dir" && verify)
if [ -f "$source_dir/INFO" ]; then cat "$source_dir/INFO"; fi

if [ "${YES:-}" != 1 ]; then
  name=$(basename "$source_dir")
  read -r -p "This replaces all current data with backup $name. Type its name to confirm: " answer
  [ "$answer" = "$name" ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the backend..."
$COMPOSE stop backend

echo "Restoring the database..."
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  --no-owner --single-transaction --exit-on-error' <"$source_dir/db.dump"

echo "Restoring the uploads..."
$COMPOSE run --rm --no-deps -T --entrypoint sh backend \
  -c 'find /data/uploads -mindepth 1 -delete && tar -C /data -xzf -' <"$source_dir/uploads.tar.gz"

echo "Starting the backend and applying migrations..."
$COMPOSE up -d --wait backend
$COMPOSE exec -T backend alembic upgrade head
echo "Restored $source_dir"
