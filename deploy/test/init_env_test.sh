#!/usr/bin/env bash
# Tests for deploy/init-env.sh. No docker, runs in a temp dir.
#   bash deploy/test/init_env_test.sh
# Never prints a secret: failures name the key only.
# shellcheck disable=SC2016
set -u
here=$(cd "$(dirname "$0")" && pwd)
script="$here/../init-env.sh"
fails=0
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work" || exit 1

ok() { echo "ok   $1"; }
bad() {
  echo "FAIL $1"
  fails=$((fails + 1))
}
# t <name> <condition...>: passes when the command succeeds.
t() {
  name=$1
  shift
  if "$@"; then ok "$name"; else bad "$name"; fi
}
get() { grep -m1 "^$1=" "$2" | cut -d= -f2-; } # get <key> <file>

# 1. non-interactive run
bash "$script" --non-interactive --domain example.com >out.txt 2>&1
t "init exits 0" test $? -eq 0
f=.env.prod
t "file exists" test -f $f
t "mode is 600" test "$(stat -c %a $f)" = 600

for spec in SESSION_SECRET:64 POSTGRES_PASSWORD:48 APP_DB_PASSWORD:48 S3_ACCESS_KEY:20 S3_SECRET_KEY:40 BACKUP_CIPHER_PASS:48; do
  k=${spec%%:*}
  n=${spec##*:}
  v=$(get "$k" $f)
  t "$k is $n hex chars" bash -c 'is_hex() { case $1 in "" | *[!0-9a-f]*) return 1 ;; esac; }; is_hex "$1" && [ "${#1}" -eq "$2" ]' _ "$v" "$n"
done
pg=$(get POSTGRES_PASSWORD $f)
app=$(get APP_DB_PASSWORD $f)
t "db passwords differ" test "$pg" != "$app"
t "BACKUP_CIPHER_PASS >= 16" test "${#pg}" -ge 16
t "DATABASE_URL has the app password" test "$(get DATABASE_URL $f)" = "postgres://cre_app:$app@db:5432/cre?sslmode=disable"
t "MIGRATE_DATABASE_URL has the owner password" test "$(get MIGRATE_DATABASE_URL $f)" = "postgres://cre_owner:$pg@db:5432/cre?sslmode=disable"
t "domain fills PUBLIC_BASE_URL" test "$(get PUBLIC_BASE_URL $f)" = https://example.com
t "domain fills SITE_ADDRESS" test "$(get SITE_ADDRESS $f)" = example.com
t "no CHANGEME left in generated keys" bash -c '! grep -E "^(SESSION_SECRET|POSTGRES_PASSWORD|APP_DB_PASSWORD|S3_ACCESS_KEY|S3_SECRET_KEY|BACKUP_CIPHER_PASS|DATABASE_URL|MIGRATE_DATABASE_URL)=.*CHANGEME" .env.prod'
t "input keys stay CHANGEME" bash -c 'grep -q "^SMTP_PASSWORD=CHANGEME" .env.prod'
t "comments kept" bash -c 'grep -q "^# Production template" .env.prod'

# 2. no secret in the output
leak=0
for s in "$pg" "$app" "$(get SESSION_SECRET $f)" "$(get S3_SECRET_KEY $f)" "$(get BACKUP_CIPHER_PASS $f)"; do
  if grep -qF -- "$s" out.txt; then leak=1; fi
done
t "output shows no secret" test $leak -eq 0

# 3. refuses to overwrite, keeps the file
cp $f before.env
bash "$script" --non-interactive >out2.txt 2>&1
t "refuses to overwrite" test $? -ne 0
t "refusal leaves file as is" cmp -s $f before.env

# 4. --check fails on CHANGEME, names key not value
bash "$script" --check $f >chk.txt 2>&1
t "check fails on leftover CHANGEME" test $? -eq 1
t "check names SMTP_PASSWORD" grep -q "SMTP_PASSWORD is still CHANGEME" chk.txt

# 5. --force keeps a backup, new secrets
bash "$script" --non-interactive --force >out3.txt 2>&1
t "force exits 0" test $? -eq 0
t "backup written" test "$(find . -maxdepth 1 -name '.env.prod.bak.*' | wc -l)" -eq 1
t "backup is mode 600" test "$(stat -c %a .env.prod.bak.* | sort -u)" = 600
t "backup is the old file" cmp -s .env.prod.bak.* before.env
t "force makes new secrets" test "$(get APP_DB_PASSWORD $f)" != "$app"
t "file is 600 after force" test "$(stat -c %a $f)" = 600

# 6. --check passes on a complete file (answers come from INIT_<KEY>)
env INIT_IMAGE_REGISTRY=ghcr.io/o/r INIT_IMAGE_TAG=0123456789012345678901234567890123456789 \
  INIT_ACME_EMAIL=ops@example.com INIT_GOOGLE_CLIENT_ID=id.apps.googleusercontent.com \
  INIT_GOOGLE_CLIENT_SECRET=gs INIT_SMTP_USER=u INIT_SMTP_PASSWORD=p \
  INIT_BACKUP_S3_ENDPOINT=https://s3.example.net INIT_BACKUP_S3_REGION=eu \
  INIT_BACKUP_S3_BUCKET=b INIT_BACKUP_LOCK_S3_BUCKET=l INIT_BACKUP_S3_KEY=k \
  INIT_BACKUP_S3_SECRET=s bash "$script" --non-interactive --force --output full.env >out4.txt 2>&1
t "full run exits 0" test $? -eq 0
t "no CHANGEME left in full file" bash -c "! grep -v \"^#\" full.env | grep -q CHANGEME"
bash "$script" --check full.env >chk2.txt 2>&1
t "check passes on a complete file" test $? -eq 0

# 7. --check rules
mk() { # mk <name> <sed expr>: copy full.env, edit, chmod 600
  sed "$2" full.env >"$1"
  chmod 600 "$1"
}
rule() { # rule <name> <sed expr> <expected message>
  mk "r_$1.env" "$2"
  bash "$script" --check "r_$1.env" >"r_$1.txt" 2>&1
  t "check fails: $1" test $? -eq 1
  t "check says: $1" grep -q -- "$3" "r_$1.txt"
}
apw=$(get APP_DB_PASSWORD full.env)
ppw=$(get POSTGRES_PASSWORD full.env)
rule equal "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=$ppw/" "are equal"
rule escaping "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=ab@c\\/d/" "URL escaping"
rule url-mismatch "s/^DATABASE_URL=.*/DATABASE_URL=postgres:\\/\\/cre_app:other@db:5432\\/cre/" "DATABASE_URL does not"
rule migrate-mismatch "s/^MIGRATE_DATABASE_URL=.*/MIGRATE_DATABASE_URL=postgres:\\/\\/cre_owner:other@db:5432\\/cre/" "MIGRATE_DATABASE_URL does not"
rule short-session "s/^SESSION_SECRET=.*/SESSION_SECRET=abc/" "SESSION_SECRET is shorter"
rule short-cipher "s/^BACKUP_CIPHER_PASS=.*/BACKUP_CIPHER_PASS=abc/" "BACKUP_CIPHER_PASS is shorter"
chmod 644 r_equal.env
bash "$script" --check r_equal.env >chk3.txt 2>&1
t "check fails on loose mode" grep -q "want 600" chk3.txt
t "check output shows no password" bash -c '! grep -qF -- "$1" chk3.txt r_*.txt' _ "$apw"

# 8. unknown flag and missing file
bash "$script" --nope >/dev/null 2>&1
t "unknown flag fails" test $? -eq 2
bash "$script" --check missing.env >/dev/null 2>&1
t "check on a missing file fails" test $? -ne 0

# 9. xtrace cannot leak: set -x in the caller does not reach the script's secrets
bash -x "$script" --non-interactive --force --output x.env >xtrace.txt 2>&1
t "script does not trace secrets" bash -c '! grep -qF -- "$1" xtrace.txt' _ "$(get APP_DB_PASSWORD x.env)"

if [ "$fails" -gt 0 ]; then
  echo "$fails failure(s)"
  exit 1
fi
echo "all passed"
