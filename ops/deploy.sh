#!/usr/bin/env bash
# Deploy (task 7.7): backup FIRST, then pull, build, and roll the stack.
# Usage: ops/deploy.sh [--dry-run]
# Rollback: the previous images are kept as :previous; see docs/deployment.md (Rollback).
set -euo pipefail

cd "$(dirname "$0")/.."
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# shellcheck source=ops/lib.sh
source ops/lib.sh
load_env
PROJECT="${COMPOSE_PROJECT_NAME:-vaultkeeper}"

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" == "0" ]]; then "$@"; fi
}

tag_previous() {
  local image="$1"
  if docker image inspect "$image:latest" >/dev/null 2>&1; then
    run docker tag "$image:latest" "$image:previous"
  fi
}

# Skip the backup on a first deploy (nothing running yet).
if docker compose -p "$PROJECT" ps --status running --services 2>/dev/null | grep -qx postgres; then
  run ops/backup.sh
else
  echo "[deploy] postgres not running: skipping pre-deploy backup (first deploy?)"
fi

tag_previous vaultkeeper-api
tag_previous vaultkeeper-web
run git pull --ff-only
run docker compose -p "$PROJECT" build
run docker compose -p "$PROJECT" up -d --remove-orphans
run docker compose -p "$PROJECT" ps
echo "[deploy] done"
