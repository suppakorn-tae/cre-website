#!/bin/sh
# backup container: pgBackRest TLS server (receives WAL from db),
# scheduler, metrics endpoint. Runs as root only to fix permissions,
# then drops to the postgres user (same uid as in the db container).
set -eu

CONF=/etc/pgbackrest/pgbackrest.conf
TLS=/etc/pgbackrest/tls
log() { printf '%s backup: %s\n' "$(date -Iseconds)" "$*"; }

mkdir -p /var/lib/backup/spool "$TLS" /scratch
/opt/backup/render-config.sh "$CONF"

if [ ! -f "$TLS/ca.crt" ]; then
  log "generating internal TLS material for db to backup traffic"
  (
    cd "$TLS"
    openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=cre-backup-ca" \
      -keyout ca.key -out ca.crt 2>/dev/null
    mk() { # name cn san
      openssl req -newkey rsa:3072 -nodes -subj "/CN=$2" -keyout "$1.key" -out "$1.csr" 2>/dev/null
      printf 'subjectAltName=DNS:%s\n' "$3" >"$1.ext"
      openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
        -days 3650 -extfile "$1.ext" -out "$1.crt" 2>/dev/null
      rm -f "$1.csr" "$1.ext"
    }
    mk server backup backup
    mk client cre-db db
    rm -f ca.srl
  )
fi
chmod 600 "$TLS"/*.key
chown -R postgres:postgres /var/lib/backup /etc/pgbackrest /scratch

# Crontab: Asia/Bangkok via TZ. One job at 02:00 picks full or diff.
mkdir -p /etc/crontabs
cat >/etc/crontabs/postgres <<'CRON'
0 2 * * * /opt/backup/scheduled.sh >>/proc/1/fd/1 2>&1
0 3 * * * /opt/backup/reports-mirror.sh >>/proc/1/fd/1 2>&1
0 4 15 * * /opt/backup/restore-check.sh >>/proc/1/fd/1 2>&1
CRON

log "starting pgbackrest tls server"
gosu postgres pgbackrest server &
log "starting metrics on :9099/cgi-bin/metrics"
gosu postgres httpd -f -p 9099 -h /opt/backup/www &
gosu postgres /opt/backup/metrics.sh loop &
gosu postgres /opt/backup/bootstrap.sh &

exec crond -f -l 8 -c /etc/crontabs
