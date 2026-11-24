#!/bin/sh
# 02:00 Asia/Bangkok daily. Sunday: full. Other days: differential.
# First Sunday of the month: also a full into repo2 (object lock, 12 months).
set -eu
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
