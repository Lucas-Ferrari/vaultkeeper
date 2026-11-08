#!/usr/bin/env bash
# Backup (task 7.6, R-DEP-3): Postgres custom-format dump + catalog images (media volume) tarball.
# Usage (repo root on the VPS): ops/backup.sh
# Env (from .env or the shell): COMPOSE_PROJECT_NAME, POSTGRES_USER, POSTGRES_DB, BACKUP_DIR,
# BACKUP_RETENTION_DAYS. Copy BACKUP_DIR off the server regularly (see docs/deployment.md).
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=ops/lib.sh
source ops/lib.sh
load_env

PROJECT="${COMPOSE_PROJECT_NAME:-vaultkeeper}"
PG_USER="${POSTGRES_USER:-vaultkeeper}"
PG_DB="${POSTGRES_DB:-vaultkeeper}"
DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE=(docker compose -p "$PROJECT")

mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"

echo "[backup] database -> $DIR/db-$STAMP.dump"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc >"$DIR/db-$STAMP.dump.partial"
mv "$DIR/db-$STAMP.dump.partial" "$DIR/db-$STAMP.dump"

echo "[backup] media volume ${PROJECT}_media -> $DIR/media-$STAMP.tar.gz"
docker run --rm -v "${PROJECT}_media:/media:ro" -v "$DIR:/backup" alpine:3 \
  tar -czf "/backup/media-$STAMP.tar.gz.partial" -C /media .
mv "$DIR/media-$STAMP.tar.gz.partial" "$DIR/media-$STAMP.tar.gz"

echo "[backup] pruning backups older than $RETENTION days"
find "$DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) \
  -mtime "+$RETENTION" -print -delete

echo "[backup] done: $STAMP"
echo "$STAMP" >"$DIR/LATEST"
