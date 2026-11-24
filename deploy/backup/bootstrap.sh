#!/bin/sh
# First start (or re-enable): create the stanza and take a full backup
# so PITR history begins. Safe to re-run.
set -eu
log() { printf '%s bootstrap: %s\n' "$(date -Iseconds)" "$*"; }

until psql -h /var/run/postgresql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -Atc 'select 1' >/dev/null 2>&1; do
  log "waiting for postgres"
  sleep 5
done
pgbackrest --stanza=cre stanza-create
# archive_mode only takes effect after a db restart (AD-26); retry.
n=0
until pgbackrest --stanza=cre check; do
  n=$((n + 1))
  [ "$n" -ge 20 ] && { log "check keeps failing, see runbook"; exit 1; }
  sleep 15
done
if ! pgbackrest --stanza=cre --repo=1 --output=json info | jq -e '.[0].backup | length > 0' >/dev/null 2>&1; then
  log "no backup in repo1, taking initial full"
  pgbackrest --stanza=cre --repo=1 --type=full backup
  /opt/backup/restore-check.sh || log "restore check FAILED"
fi
