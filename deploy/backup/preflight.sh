#!/bin/sh
# Preflight for the optional backup (AD-26). Reads env, prints every
# problem, exits 1 if any. No docker needed.
#
#   BACKUP_ENABLED        true|false (default false)
#   COMPOSE_PROFILES      comma list; "backup" means the profile is on
#   POSTGRES_ARCHIVE_MODE on|off (default off) = db archive_mode
#
# Mismatch states rejected (Architecture AD-26):
#   - backup profile on, archive_mode off
#   - backup profile off, archive_mode on
set -u
errs=0
fail() {
  printf 'preflight: ERROR: %s\n' "$*" >&2
  errs=$((errs + 1))
}

lower() { printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'; }

case "$(lower "${BACKUP_ENABLED:-false}")" in
  true | 1 | yes | on) enabled=1 ;;
  false | 0 | no | off | "") enabled=0 ;;
  *)
    fail "BACKUP_ENABLED='${BACKUP_ENABLED}' is not true or false"
    enabled=0
    ;;
esac

profile=0
oldifs=$IFS
IFS=,
for p in ${COMPOSE_PROFILES:-}; do
  [ "$p" = backup ] && profile=1
done
IFS=$oldifs

case "$(lower "${POSTGRES_ARCHIVE_MODE:-off}")" in
  on | always) archive=1 ;;
  off | "") archive=0 ;;
  *)
    fail "POSTGRES_ARCHIVE_MODE='${POSTGRES_ARCHIVE_MODE}' must be on or off"
    archive=0
    ;;
esac

if [ "$profile" = 1 ] && [ "$archive" = 0 ]; then
  fail "mismatch: the backup profile is on but db archive_mode is off. The backup container would find no WAL and every backup would look healthy while PITR is impossible. Set BACKUP_ENABLED=true (archive_mode follows) or remove 'backup' from COMPOSE_PROFILES."
fi
if [ "$profile" = 0 ] && [ "$archive" = 1 ]; then
  fail "mismatch: db archive_mode is on but the backup profile is off. WAL would pile up on the db volume with nothing shipping it and the disk would fill. Set BACKUP_ENABLED=false (archive_mode follows) or add 'backup' to COMPOSE_PROFILES."
fi
if [ "$profile" = "$archive" ] && [ "$enabled" != "$profile" ]; then
  fail "BACKUP_ENABLED=$([ "$enabled" = 1 ] && echo true || echo false) contradicts the explicit profile / archive_mode settings. Use BACKUP_ENABLED alone and unset COMPOSE_PROFILES 'backup' and POSTGRES_ARCHIVE_MODE overrides."
fi

if [ "$enabled" = 1 ]; then
  for v in BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET BACKUP_S3_KEY \
    BACKUP_S3_SECRET BACKUP_LOCK_S3_BUCKET BACKUP_CIPHER_PASS; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || fail "BACKUP_ENABLED=true but $v is empty"
  done
  if [ -n "${BACKUP_CIPHER_PASS:-}" ] && [ "${#BACKUP_CIPHER_PASS}" -lt 16 ]; then
    fail "BACKUP_CIPHER_PASS must be at least 16 characters"
  fi
  if [ -n "${BACKUP_S3_ENDPOINT:-}" ] && [ "${BACKUP_S3_ENDPOINT:-}" = "${S3_ENDPOINT:-}" ]; then
    fail "BACKUP_S3_ENDPOINT equals the app's S3_ENDPOINT. The repository must be off-site (another provider or region), never the app's RustFS."
  fi
  case "${BACKUP_S3_ENDPOINT:-}" in
    *rustfs*) fail "BACKUP_S3_ENDPOINT points at RustFS. The repository must be off-site." ;;
  esac
  if [ -n "${BACKUP_S3_KEY:-}" ] && [ "${BACKUP_S3_KEY:-}" = "${S3_ACCESS_KEY:-}" ]; then
    fail "BACKUP_S3_KEY equals the app's S3_ACCESS_KEY. Backup needs its own credentials."
  fi
  if [ -n "${BACKUP_S3_BUCKET:-}" ] && [ "${BACKUP_S3_BUCKET:-}" = "${BACKUP_LOCK_S3_BUCKET:-}" ]; then
    fail "BACKUP_LOCK_S3_BUCKET must differ from BACKUP_S3_BUCKET (it is the object-lock repository)."
  fi
fi

if [ "$errs" -gt 0 ]; then
  printf 'preflight: %d problem(s), refusing to continue.\n' "$errs" >&2
  exit 1
fi
if [ "$enabled" = 1 ]; then
  echo "preflight: ok, backup enabled (profile on, archive_mode on)"
else
  echo "preflight: ok, backup disabled (profile off, archive_mode off)"
fi
