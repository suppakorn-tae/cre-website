#!/bin/sh
# Writes Prometheus text to /var/lib/backup/metrics.prom every 60 s.
# `metrics.sh once` for a single pass.
set -u
out=/var/lib/backup/metrics.prom
sock=/var/run/postgresql
user=${POSTGRES_USER:-postgres}
db=${POSTGRES_DB:-postgres}
check_ok=0
i=0
while :; do
  now=$(date +%s)
  info=$(pgbackrest --stanza=cre --output=json info 2>/dev/null || echo '[]')
  last=$(printf '%s' "$info" | jq -r '[.[0].backup[]? | select(.database["repo-key"]==1) | .timestamp.stop] | max // 0' 2>/dev/null || echo 0)
  wal=$(psql -h "$sock" -U "$user" -d "$db" -Atc \
    "select coalesce(extract(epoch from last_archived_time),0)::bigint from pg_stat_archiver" 2>/dev/null || echo 0)
  [ -n "$wal" ] || wal=0
  if [ $((i % 5)) -eq 0 ]; then
    if pgbackrest --stanza=cre check >/dev/null 2>&1; then check_ok=1; else check_ok=0; fi
  fi
  lb=-1
  [ "${last:-0}" -gt 0 ] && lb=$((now - last))
  lw=-1
  [ "$wal" -gt 0 ] && lw=$((now - wal))
  cat >"$out.tmp" <<M
# TYPE backup_enabled gauge
backup_enabled 1
# TYPE backup_last_backup_age_seconds gauge
backup_last_backup_age_seconds $lb
# TYPE backup_last_wal_age_seconds gauge
backup_last_wal_age_seconds $lw
# TYPE backup_check_ok gauge
backup_check_ok $check_ok
M
  mv "$out.tmp" "$out"
  [ "${1:-loop}" = once ] && exit 0
  i=$((i + 1))
  sleep 60
done
