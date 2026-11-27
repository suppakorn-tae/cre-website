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
#
# With compose.prod.yaml in the file list, images run by digest (IO-245).
# IMAGE_TAG must be a release version (v1.4.0) or a full git SHA; `latest`
# and branch names are refused. `pull` resolves IMAGE_TAG to the digest
# of each image in IMAGE_REGISTRY and writes them to DIGEST_FILE (default
# ./.env.digests). Every other command reads that file, so `up` runs the
# digests that were pulled even if the tag moves later. `up` appends the
# deployed tag, commit and digests to DIGEST_FILE.log.
#
# Before `pull` and `up` with compose.prod.yaml, the env file must pass
# `bash deploy/init-env.sh --check` (no CHANGEME, secrets set, mode 600).
# That script needs bash, so it is run with bash even though this one is sh.
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

# Production images: pin IMAGE_TAG to digests.
digest_file=${DIGEST_FILE:-$root/.env.digests}
images="api worker migrate web"

resolve_digest() {
  ref=$1
  d=$(docker buildx imagetools inspect --format '{{json .Manifest.Digest}}' "$ref" 2>/dev/null |
    tr -d '"[:space:]') || d=
  if [ -z "$d" ]; then
    # No buildx: pull and read the repo digest instead.
    if docker pull -q "$ref" >/dev/null; then
      d=$(docker image inspect --format '{{index .RepoDigests 0}}' "$ref") || d=
      d=${d#*@}
    fi
  fi
  printf '%s' "$d" | grep -Eq '^sha256:[0-9a-f]{64}$' || {
    echo "deploy.sh: cannot resolve the digest of $ref" >&2
    return 1
  }
  printf '%s' "$d"
}

pin_images() {
  tag=${IMAGE_TAG:-}
  if ! printf '%s' "$tag" | grep -Eq '^(v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?|[0-9a-f]{40})$'; then
    echo "deploy.sh: IMAGE_TAG='$tag' is not a release version (v1.4.0) or a full git SHA;" \
      "latest and branch names are refused" >&2
    exit 1
  fi
  : "${IMAGE_REGISTRY:?deploy.sh: set IMAGE_REGISTRY}"
  case "${1:-}" in
    pull | up)
      [ -f "$env_file" ] || {
        echo "deploy.sh: env file not found: $env_file" >&2
        exit 1
      }
      bash "$root/deploy/init-env.sh" --check "$env_file" >&2 || {
        echo "deploy.sh: $env_file failed the check above; fix it and retry" >&2
        exit 1
      }
      ;;
  esac
  if [ "${1:-}" = pull ]; then
    pins=
    for i in $images; do
      d=$(resolve_digest "$IMAGE_REGISTRY/cre-$i:$tag") || exit 1
      pins="${pins}IMAGE_DIGEST_$(printf '%s' "$i" | tr '[:lower:]' '[:upper:]')=$d
"
    done
    {
      echo "# Written by deploy.sh pull at $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not edit."
      echo "IMAGE_PIN_REGISTRY=$IMAGE_REGISTRY"
      echo "IMAGE_PIN_TAG=$tag"
      printf '%s' "$pins"
    } >"$digest_file.tmp"
    mv "$digest_file.tmp" "$digest_file"
    echo "deploy.sh: pinned $tag in $digest_file" >&2
    grep '^IMAGE_DIGEST_' "$digest_file" >&2
  fi
  [ -f "$digest_file" ] || {
    echo "deploy.sh: no pinned digests in $digest_file; run deploy.sh pull first" >&2
    exit 1
  }
  # Only the pinned digests count, never values from the env file.
  unset IMAGE_PIN_REGISTRY IMAGE_PIN_TAG IMAGE_DIGEST_API IMAGE_DIGEST_WORKER \
    IMAGE_DIGEST_MIGRATE IMAGE_DIGEST_WEB
  set -a
  # shellcheck disable=SC1090
  . "$digest_file"
  set +a
  if [ "${IMAGE_PIN_TAG:-}" != "$tag" ] || [ "${IMAGE_PIN_REGISTRY:-}" != "$IMAGE_REGISTRY" ]; then
    echo "deploy.sh: $digest_file pins ${IMAGE_PIN_REGISTRY:-?}:${IMAGE_PIN_TAG:-?}," \
      "not $IMAGE_REGISTRY:$tag; run deploy.sh pull first" >&2
    exit 1
  fi
  if [ "${1:-}" = up ]; then
    printf '%s tag=%s commit=%s api=%s worker=%s migrate=%s web=%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$tag" \
      "$(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown)" \
      "${IMAGE_DIGEST_API:-}" "${IMAGE_DIGEST_WORKER:-}" \
      "${IMAGE_DIGEST_MIGRATE:-}" "${IMAGE_DIGEST_WEB:-}" >>"$digest_file.log"
  fi
}

case " $files " in
  *"/compose.prod.yaml "*) pin_images "${1:-}" ;;
esac

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
