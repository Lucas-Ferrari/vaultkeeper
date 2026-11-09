#!/usr/bin/env bash
# Restore (task 7.6, R-DEP-3): stop api, pg_restore --clean, replace media, start api.
# Usage: ops/restore.sh [STAMP]   (default: the stamp in $BACKUP_DIR/LATEST)
# DESTRUCTIVE: replaces the current database and catalog images. Asks for confirmation unless
# RESTORE_YES=1.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=ops/lib.sh
source ops/lib.sh
load_env

PROJECT="${COMPOSE_PROJECT_NAME:-vaultkeeper}"
PG_USER="${POSTGRES_USER:-vaultkeeper}"
PG_DB="${POSTGRES_DB:-vaultkeeper}"
DIR="$(cd "${BACKUP_DIR:-./backups}" && pwd)"
STAMP="${1:-$(<"$DIR/LATEST")}"
DUMP="$DIR/db-$STAMP.dump"
MEDIA="$DIR/media-$STAMP.tar.gz"
COMPOSE=(docker compose -p "$PROJECT")

[[ -f "$DUMP" ]] || { echo "missing $DUMP" >&2; exit 1; }
[[ -f "$MEDIA" ]] || { echo "missing $MEDIA" >&2; exit 1; }

if [[ "${RESTORE_YES:-0}" != "1" ]]; then
  read -r -p "Restore $STAMP over project '$PROJECT'? This replaces ALL data. [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "aborted"; exit 1; }
fi

echo "[restore] stopping api"
"${COMPOSE[@]}" stop api

echo "[restore] database <- $DUMP"
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$PG_USER" -d "$PG_DB" \
  --clean --if-exists --no-owner --single-transaction <"$DUMP"

echo "[restore] media volume ${PROJECT}_media <- $MEDIA"
docker run --rm -v "${PROJECT}_media:/media" -v "$DIR:/backup:ro" alpine:3 \
  sh -c "find /media -mindepth 1 -delete && tar -xzf /backup/media-$STAMP.tar.gz -C /media && chown -R 1000:1000 /media"

echo "[restore] starting api"
"${COMPOSE[@]}" start api
echo "[restore] done: $STAMP"
