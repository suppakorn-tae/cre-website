#!/bin/sh
# Render the backup container's pgbackrest.conf from env.
# Usage: render-config.sh <output-file>
set -eu
out=${1:?usage: render-config.sh <output-file>}

: "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_REGION:?}" "${BACKUP_S3_BUCKET:?}"
: "${BACKUP_S3_KEY:?}" "${BACKUP_S3_SECRET:?}" "${BACKUP_CIPHER_PASS:?}"
: "${BACKUP_LOCK_S3_BUCKET:?}"

case "${BACKUP_S3_PATH_STYLE:-true}" in
  true | 1 | yes | on) uri=path ;;
  *) uri=host ;;
esac
verify=${BACKUP_S3_VERIFY_TLS:-y}
case "$verify" in true | 1 | yes | on) verify=y ;; false | 0 | no | off) verify=n ;; esac

umask 077
cat >"$out" <<CONF
[global]
start-fast=y
compress-type=zst
process-max=2
log-level-console=info
spool-path=/var/lib/backup/spool
tls-server-address=0.0.0.0
tls-server-port=8432
tls-server-ca-file=/etc/pgbackrest/tls/ca.crt
tls-server-cert-file=/etc/pgbackrest/tls/server.crt
tls-server-key-file=/etc/pgbackrest/tls/server.key
tls-server-auth=cre-db=cre

# repo1: rolling repository, 5 full backups with all WAL between them
repo1-type=s3
repo1-path=/pgbackrest
repo1-s3-endpoint=${BACKUP_S3_ENDPOINT}
repo1-s3-region=${BACKUP_S3_REGION}
repo1-s3-bucket=${BACKUP_S3_BUCKET}
repo1-s3-key=${BACKUP_S3_KEY}
repo1-s3-key-secret=${BACKUP_S3_SECRET}
repo1-s3-uri-style=${uri}
repo1-storage-verify-tls=${verify}
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${BACKUP_CIPHER_PASS}
repo1-retention-full-type=count
repo1-retention-full=5

# repo2: monthly full, object-lock bucket, kept 12 months
repo2-type=s3
repo2-path=/pgbackrest-monthly
repo2-s3-endpoint=${BACKUP_S3_ENDPOINT}
repo2-s3-region=${BACKUP_S3_REGION}
repo2-s3-bucket=${BACKUP_LOCK_S3_BUCKET}
repo2-s3-key=${BACKUP_LOCK_S3_KEY:-$BACKUP_S3_KEY}
repo2-s3-key-secret=${BACKUP_LOCK_S3_SECRET:-$BACKUP_S3_SECRET}
repo2-s3-uri-style=${uri}
repo2-storage-verify-tls=${verify}
repo2-cipher-type=aes-256-cbc
repo2-cipher-pass=${BACKUP_CIPHER_PASS}
repo2-retention-full-type=count
repo2-retention-full=12

[cre]
pg1-path=/var/lib/postgresql/19/docker
pg1-socket-path=/var/run/postgresql
pg1-user=${POSTGRES_USER:-postgres}
pg1-database=${POSTGRES_DB:-postgres}
CONF
