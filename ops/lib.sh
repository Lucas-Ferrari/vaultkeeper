#!/usr/bin/env bash
# Shared helpers for the ops scripts. Sourced, not executed.

# Loads KEY=VALUE lines from .env WITHOUT overriding variables already set in the environment,
# so `BACKUP_DIR=/mnt/x ops/backup.sh` wins over .env. Comments and blank lines are skipped.
load_env() {
  local file="${1:-.env}" key value
  [[ -f "$file" ]] || return 0
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    [[ -n "${!key+x}" ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    export "$key=$value"
  done <"$file"
}
