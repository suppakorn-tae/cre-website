#!/bin/sh
# Nightly mirror of the app bucket's reports/ prefix. exports/ is
# never copied (temporary, rebuilt by re-running the export).
# `copy` not `sync`: a deletion on the app side must not erase the
# off-site copy.
set -eu
: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}"
case "${BACKUP_S3_PATH_STYLE:-true}" in
  true | 1 | yes | on) force=true ;;
  *) force=false ;;
esac
export RCLONE_CONFIG_SRC_TYPE=s3 RCLONE_CONFIG_SRC_PROVIDER=Other \
  RCLONE_CONFIG_SRC_ENDPOINT="$S3_ENDPOINT" \
  RCLONE_CONFIG_SRC_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  RCLONE_CONFIG_SRC_FORCE_PATH_STYLE=true \
  RCLONE_CONFIG_DST_TYPE=s3 RCLONE_CONFIG_DST_PROVIDER=Other \
  RCLONE_CONFIG_DST_ENDPOINT="$BACKUP_S3_ENDPOINT" \
  RCLONE_CONFIG_DST_REGION="$BACKUP_S3_REGION" \
  RCLONE_CONFIG_DST_ACCESS_KEY_ID="$BACKUP_S3_KEY" \
  RCLONE_CONFIG_DST_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET" \
  RCLONE_CONFIG_DST_FORCE_PATH_STYLE="$force"
rclone copy "SRC:${S3_BUCKET}/reports" "DST:${BACKUP_S3_BUCKET}/reports-mirror" \
  --exclude 'exports/**' --fast-list --stats-one-line
date +%s >/var/lib/backup/reports_mirror_last_success
