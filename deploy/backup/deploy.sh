#!/bin/sh
# Deploy wrapper: maps the single BACKUP_ENABLED flag to the `backup`
# Compose profile and db archive_mode, runs preflight, then calls
# docker compose. Use it instead of `docker compose` / `make up`.
#
#   deploy/backup/deploy.sh up -d
#   deploy/backup/deploy.sh down
#
# Extra compose files (e.g. the production overlay) come from
# COMPOSE_EXTRA, space or comma separated. Relative names resolve in
# deploy/compose.
#
#   COMPOSE_EXTRA=compose.prod.yaml deploy/backup/deploy.sh up -d
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

# Compose file list, base files first, extras last so they override.
cdir=$root/deploy/compose
files="-f $cdir/compose.yaml -f $cdir/compose.backup.yaml"
for f in $(printf '%s' "${COMPOSE_EXTRA:-}" | tr ',' ' '); do
  case "$f" in
    /*) ;;
    *) f=$cdir/$f ;;
  esac
  [ -f "$f" ] || {
    echo "deploy.sh: COMPOSE_EXTRA file not found: $f" >&2
    exit 1
  }
  files="$files -f $f"
done

case ",${COMPOSE_PROFILES}," in
  *,backup,*)
    # db needs the pgbackrest binary for archive_command.
    export DB_IMAGE=cre-pgbackrest:local
    # shellcheck disable=SC2086
    docker compose $files build backup
    ;;
esac

# shellcheck disable=SC2086
exec docker compose $files "$@"
