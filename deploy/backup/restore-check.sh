#!/bin/sh
# Restore the newest repo1 backup into a scratch dir, start it on a
# private socket and run smoke queries. Never touches production.
# Needs free space in /scratch about the size of the database.
set -eu
# crond may start jobs without the image PATH; the PostgreSQL tools live here on Debian.
export PATH="/usr/lib/postgresql/${PG_MAJOR:-19}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
dir=/scratch/restore-check
sock=/scratch/sock
rm -rf "$dir" "$sock"
mkdir -p "$sock"
chmod 700 "$sock"
pgbackrest --stanza=cre --repo=1 --pg1-path="$dir" --type=immediate \
  --target-action=promote restore
trap 'pg_ctl -D "$dir" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir" "$sock"' EXIT
pg_ctl -D "$dir" -o "-c listen_addresses='' -c unix_socket_directories=$sock -c archive_mode=off" -w start
db=${POSTGRES_DB:-postgres}
user=${POSTGRES_USER:-postgres}
psql -h "$sock" -U "$user" -d "$db" -Atc 'select 1' >/dev/null
tables=$(psql -h "$sock" -U "$user" -d "$db" -Atc \
  "select count(*) from information_schema.tables where table_schema='public'")
echo "restore check: ok, $tables public tables"
date +%s >/var/lib/backup/restore_check_last_success
