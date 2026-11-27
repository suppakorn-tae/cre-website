#!/bin/sh
# Tests for preflight.sh and render-config.sh. POSIX sh, no docker.
#   sh deploy/backup/test/preflight_test.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
pf="$here/../preflight.sh"
rc="$here/../render-config.sh"
fails=0

# run <name> <expect-exit> <expect-stderr-substring> [VAR=val ...]
run() {
  name=$1 want=$2 pat=$3
  shift 3
  out=$(env -i PATH="$PATH" "$@" sh "$pf" 2>&1)
  got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL $name: exit $got, want $want: $out"
    fails=$((fails + 1))
  elif [ -n "$pat" ] && ! printf '%s' "$out" | grep -q -- "$pat"; then
    echo "FAIL $name: output lacks '$pat': $out"
    fails=$((fails + 1))
  else
    echo "ok   $name"
  fi
}

full="BACKUP_S3_ENDPOINT=https://s3.example.net BACKUP_S3_REGION=eu BACKUP_S3_BUCKET=a BACKUP_S3_KEY=k BACKUP_S3_SECRET=s BACKUP_LOCK_S3_BUCKET=b BACKUP_CIPHER_PASS=0123456789abcdef"

run disabled-default 0 "backup disabled"
run disabled-explicit 0 "backup disabled" BACKUP_ENABLED=false COMPOSE_PROFILES=dev POSTGRES_ARCHIVE_MODE=off
# shellcheck disable=SC2086
run enabled-ok 0 "backup enabled" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=on $full
# shellcheck disable=SC2086
run mismatch-profile-on-archive-off 1 "profile is on but db archive_mode is off" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=off $full
run mismatch-profile-off-archive-on 1 "archive_mode is on but the backup profile is off" BACKUP_ENABLED=false COMPOSE_PROFILES=dev POSTGRES_ARCHIVE_MODE=on
# shellcheck disable=SC2086
run flag-contradicts-both-off 1 "contradicts" BACKUP_ENABLED=true COMPOSE_PROFILES=dev POSTGRES_ARCHIVE_MODE=off $full
run flag-contradicts-both-on 1 "contradicts" BACKUP_ENABLED=false COMPOSE_PROFILES=backup,dev POSTGRES_ARCHIVE_MODE=on
run bad-flag 1 "not true or false" BACKUP_ENABLED=maybe
run missing-vars 1 "BACKUP_S3_BUCKET is empty" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=on
# shellcheck disable=SC2086
run same-endpoint-as-app 1 "off-site" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=on S3_ENDPOINT=https://s3.example.net $full
# shellcheck disable=SC2086
run rustfs-endpoint 1 "RustFS" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=on $full BACKUP_S3_ENDPOINT=http://rustfs:9000
# shellcheck disable=SC2086
run short-cipher 1 "16 characters" BACKUP_ENABLED=true COMPOSE_PROFILES=backup POSTGRES_ARCHIVE_MODE=on $full BACKUP_CIPHER_PASS=short

# render-config
tmp=$(mktemp)
env -i PATH="$PATH" BACKUP_S3_ENDPOINT=minio:9000 BACKUP_S3_REGION=us-east-1 BACKUP_S3_BUCKET=a \
  BACKUP_S3_KEY=k BACKUP_S3_SECRET=s BACKUP_LOCK_S3_BUCKET=b BACKUP_CIPHER_PASS=0123456789abcdef \
  sh "$rc" "$tmp"
for want in repo1-retention-full=5 repo2-retention-full=12 repo1-cipher-type=aes-256-cbc \
  compress-type=zst repo1-s3-uri-style=path repo2-s3-bucket=b repo1-s3-endpoint=minio:9000 \
  pg1-path=/var/lib/postgresql/19/docker; do
  if grep -q "^$want\$" "$tmp"; then echo "ok   render $want"; else
    echo "FAIL render lacks $want"
    fails=$((fails + 1))
  fi
done
rm -f "$tmp"

# The db side config must point at the same PGDATA (image 18+ layout).
if grep -q '^pg1-path=/var/lib/postgresql/19/docker$' "$here/../pgbackrest.db.conf"; then
  echo "ok   db conf pg1-path"
else
  echo "FAIL db conf pg1-path is not /var/lib/postgresql/19/docker"
  fails=$((fails + 1))
fi

[ "$fails" -eq 0 ] || { echo "$fails failure(s)"; exit 1; }
echo "all passed"
