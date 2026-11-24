#!/bin/sh
pgrep -f 'pgbackrest server' >/dev/null || exit 1
pgrep crond >/dev/null || exit 1
f=/var/lib/backup/metrics.prom
[ -f "$f" ] && [ $(($(date +%s) - $(stat -c %Y "$f"))) -lt 180 ]
