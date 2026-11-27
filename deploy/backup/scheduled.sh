#!/bin/sh
# 02:00 Asia/Bangkok daily. Sunday: full. Other days: differential.
# First Sunday of the month: also a full into repo2 (object lock, 12 months).
set -eu
# crond may start jobs without the image PATH; the PostgreSQL tools live here on Debian.
export PATH="/usr/lib/postgresql/${PG_MAJOR:-19}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
dow=$(date +%u)
dom=$(date +%d)
if [ "$dow" = 7 ]; then
  pgbackrest --stanza=cre --repo=1 --type=full backup
  if [ "$dom" -le 7 ]; then
    pgbackrest --stanza=cre --repo=2 --type=full backup
  fi
else
  pgbackrest --stanza=cre --repo=1 --type=diff backup
fi
