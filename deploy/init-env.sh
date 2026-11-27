#!/usr/bin/env bash
# Write .env.prod from deploy/compose/env.prod.example for the first deploy.
#
#   deploy/init-env.sh [--domain D] [--acme-email E] [--registry R]
#                      [--image-tag T] [--non-interactive] [--force]
#                      [--output FILE] [--example FILE]
#   deploy/init-env.sh --check [FILE]        (default .env.prod)
#
# Generates the random secrets, keeps the database passwords in step with
# DATABASE_URL and MIGRATE_DATABASE_URL, and asks for the rest (or reads
# INIT_<KEY> from the environment, for example INIT_SMTP_PASSWORD). Values it
# cannot get stay CHANGEME with --non-interactive or when no terminal is
# attached. Secrets are never printed, never passed as arguments, and the
# file is written with mode 600. --check lists problems by key name only and
# exits 1 if it finds any.
set -eu
set +x
umask 077

here=$(cd "$(dirname "$0")" && pwd)
example="$here/compose/env.prod.example"
output=.env.prod
mode=init
force=0
interactive=1
domain=${INIT_DOMAIN:-}
check_file=

die() {
  echo "init-env: $*" >&2
  exit 2
}

need() { [ "$1" -gt 1 ] || die "$2 needs a value"; }

while [ $# -gt 0 ]; do
  case $1 in
    --check)
      mode=check
      if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then
        check_file=$2
        shift
      fi
      ;;
    --force) force=1 ;;
    --non-interactive) interactive=0 ;;
    --domain) need $# "$1"; domain=$2; shift ;;
    --acme-email) need $# "$1"; export INIT_ACME_EMAIL=$2; shift ;;
    --registry) need $# "$1"; export INIT_IMAGE_REGISTRY=$2; shift ;;
    --image-tag) need $# "$1"; export INIT_IMAGE_TAG=$2; shift ;;
    --output) need $# "$1"; output=$2; shift ;;
    --example) need $# "$1"; example=$2; shift ;;
    -h | --help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

# deploy/backup/deploy.sh sources the env file in a shell, then compose reads
# the exported variables. A value is therefore safe only if the shell leaves it
# alone: no whitespace, quotes, $, backticks, ; & | < > ( ) \\, no CR or LF.
unsafe_value() { # unsafe_value <value>: succeeds when the value is not plain
  case $1 in
    *[!A-Za-z0-9._~:/@%+,=?-]*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------- check mode

do_check() {
  local file=$1 line key val bad=0 n k perm pg app
  local -A v=()
  local -a placeholders=() unsafe=()
  [ -f "$file" ] || die "no such file: $file"

  while IFS= read -r line || [ -n "$line" ]; do
    case $line in '' | '#'*) continue ;; esac
    case $line in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    v[$key]=$val
    case $val in *CHANGEME*) placeholders+=("$key") ;; esac
    if unsafe_value "$val"; then unsafe+=("$key"); fi
  done <"$file"

  fail() {
    echo "FAIL $*"
    bad=$((bad + 1))
  }

  for k in ${placeholders[@]+"${placeholders[@]}"}; do
    fail "$k is still CHANGEME"
  done

  for k in ${unsafe[@]+"${unsafe[@]}"}; do
    fail "$k has a character the shell would change (space, quote, \$, backtick, ; & | < > ( ) \\, CR); use plain characters"
  done

  pg=${v[POSTGRES_PASSWORD]:-}
  app=${v[APP_DB_PASSWORD]:-}
  for k in SESSION_SECRET POSTGRES_PASSWORD APP_DB_PASSWORD DATABASE_URL MIGRATE_DATABASE_URL \
    S3_ACCESS_KEY S3_SECRET_KEY BACKUP_CIPHER_PASS; do
    [ -n "${v[$k]:-}" ] || fail "$k is missing or empty"
  done
  if [ -n "$pg" ] && [ "$pg" = "$app" ]; then
    fail "POSTGRES_PASSWORD and APP_DB_PASSWORD are equal"
  fi
  for k in POSTGRES_PASSWORD APP_DB_PASSWORD; do
    case ${v[$k]:-} in
      '' | *CHANGEME*) ;;
      *[!A-Za-z0-9]*) fail "$k has characters that need URL escaping (use letters and digits only)" ;;
    esac
  done
  if [ -n "$app" ]; then
    case ${v[DATABASE_URL]:-} in
      *"://cre_app:$app@"*) ;;
      *) fail "DATABASE_URL does not use cre_app with APP_DB_PASSWORD" ;;
    esac
  fi
  if [ -n "$pg" ]; then
    case ${v[MIGRATE_DATABASE_URL]:-} in
      *"://${v[POSTGRES_USER]:-cre_owner}:$pg@"*) ;;
      *) fail "MIGRATE_DATABASE_URL does not use POSTGRES_USER with POSTGRES_PASSWORD" ;;
    esac
  fi
  n=${#v[SESSION_SECRET]}
  if [ "$n" -gt 0 ] && [ "$n" -lt 32 ]; then fail "SESSION_SECRET is shorter than 32 characters"; fi
  n=${#v[BACKUP_CIPHER_PASS]}
  if [ "$n" -gt 0 ] && [ "$n" -lt 16 ]; then fail "BACKUP_CIPHER_PASS is shorter than 16 characters"; fi

  if perm=$(stat -c %a "$file" 2>/dev/null) || perm=$(stat -f %Lp "$file" 2>/dev/null); then
    case $perm in
      600 | 400) ;;
      *) fail "$file mode is $perm, want 600 or 400" ;;
    esac
  fi

  if [ "$bad" -gt 0 ]; then
    echo "init-env: $bad problem(s) in $file"
    return 1
  fi
  echo "init-env: $file ok"
}

if [ "$mode" = check ]; then
  if do_check "${check_file:-.env.prod}"; then exit 0; else exit 1; fi
fi

# ----------------------------------------------------------------- init mode

[ -f "$example" ] || die "template not found: $example"
if [ -e "$output" ] && [ "$force" -ne 1 ]; then
  die "$output exists; use --force to replace it (a timestamped backup is kept)"
fi
[ -t 0 ] || interactive=0

hex() { # hex <bytes>
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -vtx1 -N "$1" /dev/urandom | tr -d ' \n'
  fi
}

session=$(hex 32)
pg=$(hex 24)
app=$(hex 24)
while [ "$app" = "$pg" ]; do app=$(hex 24); done
s3_access=$(hex 10)
s3_secret=$(hex 20)
cipher=$(hex 24)

# ask <key> <secret:0|1>: sets REPLY from INIT_<key>, a prompt, or empty.
ask() {
  local name="INIT_$1"
  REPLY=${!name:-}
  if [ -z "$REPLY" ] && [ "$interactive" -eq 1 ]; then
    if [ "$2" = 1 ]; then
      printf '%s (hidden, empty to skip): ' "$1" >&2
      IFS= read -rs REPLY || REPLY=
      echo >&2
    else
      printf '%s (empty to skip): ' "$1" >&2
      IFS= read -r REPLY || REPLY=
    fi
  fi
  if unsafe_value "$REPLY"; then
    die "the value for $1 has a space, quote, \$, backtick, newline or other character the shell would change; edit .env.prod by hand for it"
  fi
}

is_secret() {
  case $1 in *SECRET* | *PASSWORD* | *_KEY | *PASS) return 0 ;; *) return 1 ;; esac
}

if [ -z "$domain" ] && [ "$interactive" -eq 1 ]; then
  printf 'Domain (empty keeps the template value): ' >&2
  IFS= read -r domain || domain=
fi
case $domain in
  *[!A-Za-z0-9.-]*) die "domain must be a bare host name such as example.com" ;;
esac

tmp=$(mktemp "${output}.XXXXXX")
trap 'rm -f "$tmp"' EXIT
pending=()

while IFS= read -r line || [ -n "$line" ]; do
  case $line in '' | '#'*)
    printf '%s\n' "$line" >>"$tmp"
    continue
    ;;
  esac
  case $line in *=*) ;; *)
    printf '%s\n' "$line" >>"$tmp"
    continue
    ;;
  esac
  key=${line%%=*}
  val=${line#*=}
  case $key in
    SESSION_SECRET) val=$session ;;
    POSTGRES_PASSWORD) val=$pg ;;
    APP_DB_PASSWORD) val=$app ;;
    S3_ACCESS_KEY) val=$s3_access ;;
    S3_SECRET_KEY) val=$s3_secret ;;
    BACKUP_CIPHER_PASS) val=$cipher ;;
    DATABASE_URL) val=${val/CHANGEME-openssl-rand-hex-24/$app} ;;
    MIGRATE_DATABASE_URL) val=${val/CHANGEME/$pg} ;;
    PUBLIC_BASE_URL) [ -z "$domain" ] || val=https://$domain ;;
    SITE_ADDRESS) [ -z "$domain" ] || val=$domain ;;
    *)
      case $val in
        *CHANGEME*)
          secret=0
          if is_secret "$key"; then secret=1; fi
          ask "$key" "$secret"
          if [ -n "$REPLY" ]; then val=$REPLY; else pending+=("$key"); fi
          ;;
      esac
      ;;
  esac
  printf '%s=%s\n' "$key" "$val" >>"$tmp"
done <"$example"

chmod 600 "$tmp"
if [ -e "$output" ]; then
  backup="$output.bak.$(date +%Y%m%d%H%M%S)"
  cp -p "$output" "$backup"
  chmod 600 "$backup"
  echo "init-env: kept the old file as $backup"
fi
mv "$tmp" "$output"
trap - EXIT
chmod 600 "$output"

echo "init-env: wrote $output (mode 600); secrets are not shown."
if [ ${#pending[@]} -gt 0 ]; then
  echo "init-env: still CHANGEME, fill by hand: ${pending[*]}"
fi
echo "init-env: verify with: deploy/init-env.sh --check $output"
