#!/usr/bin/env bash
# Local stack smoke test (task 7.4) + restore drill (task 7.6). Throwaway project, never prod.
# Usage: ops/smoke.sh   (needs Docker; ports 80/443 free). Exits 0 when every check passes.
set -euo pipefail

cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=vk-smoke
export DOMAIN=localhost
export POSTGRES_PASSWORD=smoke-only-password
export BETTER_AUTH_SECRET=smoke-only-secret-0123456789abcdefghijklmnop
export BACKUP_DIR
BACKUP_DIR="$(mktemp -d)"
COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" --env-file /dev/null)
CURL=(curl -sk --resolve localhost:443:127.0.0.1)
ORIGIN=https://localhost
EMAIL="smoke-$(date +%s)@example.com"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }
psql_q() { "${COMPOSE[@]}" exec -T postgres psql -U vaultkeeper -d vaultkeeper -tAc "$1"; }
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$BACKUP_DIR"; }
trap cleanup EXIT

wait_healthy() {
  for _ in $(seq 1 60); do
    [[ "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$ORIGIN/healthz")" == "200" ]] && return 0
    sleep 2
  done
  fail "healthz never returned 200"
}

echo "== up"
"${COMPOSE[@]}" up -d --build --wait
wait_healthy
echo "ok: https healthz 200 (R-DEP-1 S1)"

code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
[[ "$code" == "308" || "$code" == "301" ]] || fail "http did not redirect to https ($code)"
echo "ok: http -> https redirect (R-DEP-1 S2)"

for svc in api postgres migrate; do
  # EXPOSEd ports show up with PublishedPort 0; only a non-zero one reaches the host.
  ports="$("${COMPOSE[@]}" ps -a --format '{{range .Publishers}}{{if .PublishedPort}}{{.PublishedPort}} {{end}}{{end}}' "$svc")"
  [[ -z "${ports// /}" ]] || fail "$svc publishes ports: $ports"
done
echo "ok: only caddy publishes ports (R-DEP-1 S4)"

[[ "$(psql_q 'select count(*) from catalog_items')" -gt 0 ]] || fail "seed not applied"
[[ "$(psql_q 'select count(*) from app_settings')" -gt 0 ]] || fail "settings defaults missing"
echo "ok: migrations + defaults + seed applied (R-DEP-2 S1)"

items_before="$(psql_q 'select count(*) from catalog_items')"
"${COMPOSE[@]}" up -d --wait
wait_healthy
[[ "$("${COMPOSE[@]}" ps -a --format '{{.ExitCode}}' migrate)" == "0" ]] || fail "re-migrate failed"
[[ "$(psql_q 'select count(*) from catalog_items')" == "$items_before" ]] || fail "seed duplicated rows"
echo "ok: redeploy without errors or duplicates (R-DEP-2 S2)"

echo "== data: user + stock-less catalog image"
signup="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H 'content-type: application/json' \
  -H "origin: $ORIGIN" -X POST "$ORIGIN/api/auth/sign-up/email" \
  -d "{\"name\":\"Smoke\",\"email\":\"$EMAIL\",\"password\":\"smoke-password-123\"}")"
[[ "$signup" == "200" ]] || fail "sign-up returned $signup"
"${COMPOSE[@]}" exec -T api sh -c 'mkdir -p /data/media/smoke && echo smoke > /data/media/smoke/probe.txt'

"${COMPOSE[@]}" up -d --force-recreate --wait
wait_healthy
[[ "$(psql_q "select count(*) from \"user\" where email='$EMAIL'")" == "1" ]] || fail "user lost on recreate"
"${COMPOSE[@]}" exec -T api test -f /data/media/smoke/probe.txt || fail "media lost on recreate"
echo "ok: containers recreated, user + media still there (R-DEP-3 S2)"

echo "== restore drill"
ops/backup.sh
psql_q "delete from \"user\" where email='$EMAIL'" >/dev/null
"${COMPOSE[@]}" exec -T api rm -rf /data/media/smoke
RESTORE_YES=1 ops/restore.sh
wait_healthy
[[ "$(psql_q "select count(*) from \"user\" where email='$EMAIL'")" == "1" ]] || fail "user not restored"
"${COMPOSE[@]}" exec -T api test -f /data/media/smoke/probe.txt || fail "media not restored"
echo "ok: backup -> wipe -> restore brings users and images back (R-DEP-3 S3)"

echo "SMOKE PASSED"
