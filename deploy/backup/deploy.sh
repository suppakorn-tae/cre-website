#!/bin/sh
# Deploy wrapper: maps the single BACKUP_ENABLED flag to the `backup`
# Compose profile and db archive_mode, runs preflight, then calls
# docker compose. Use it instead of `docker compose` / `make up`.
#
#   deploy/backup/deploy.sh up -d
#   deploy/backup/deploy.sh down
#
# Env comes from ./.env (repo root) unless ENV_FILE is set.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
env_file=${ENV_FILE:-$root/.env}

if [ -f "$env_file" ]; then
  tmp=$(mktemp)
  tr -d '\r' <"$env_file" >"$tmp"
  set -a
  # shellcheck disable=SC1090
  . "$tmp"
  set +a
  rm -f "$tmp"
fi

flag=$(printf '%s' "${BACKUP_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')
case "$flag" in
  true | 1 | yes | on)
    # Map the flag to both sides. Explicit contradicting values are kept
    # so that preflight can reject them.
    case ",${COMPOSE_PROFILES:-}," in
      *,backup,*) ;;
      *) COMPOSE_PROFILES=${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}backup ;;
    esac
    : "${POSTGRES_ARCHIVE_MODE:=on}"
    ;;
  *)
    : "${POSTGRES_ARCHIVE_MODE:=off}"
    ;;
esac
export COMPOSE_PROFILES="${COMPOSE_PROFILES:-}" POSTGRES_ARCHIVE_MODE BACKUP_ENABLED="${BACKUP_ENABLED:-false}"

"$here/preflight.sh"

case ",${COMPOSE_PROFILES}," in
  *,backup,*)
    # db needs the pgbackrest binary for archive_command.
    export DB_IMAGE=cre-pgbackrest:local
    docker compose -f "$root/deploy/compose/compose.yaml" \
      -f "$root/deploy/compose/compose.backup.yaml" build backup
    ;;
esac

exec docker compose -f "$root/deploy/compose/compose.yaml" \
  -f "$root/deploy/compose/compose.backup.yaml" "$@"
