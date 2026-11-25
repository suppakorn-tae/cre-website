# Deploy runbook: production (conriskexpert.com)

Spec: Architecture v2.13 (Stack, Networking, Backup and recovery,
Kubernetes-readiness 1 and 6, Resolved in v2.13).
Files: `deploy/compose/compose.prod.yaml`, `deploy/compose/Caddyfile.prod`,
`deploy/compose/env.prod.example`, `.github/workflows/release.yml`.

## Images

`release.yml` runs on every push to `main` (and by hand) and pushes four
images to GHCR, each tagged with the full commit SHA:

`ghcr.io/<owner>/<repo>/cre-api`, `cre-worker`, `cre-migrate`, `cre-web`.

Production never builds on the server. Set `IMAGE_TAG` to the SHA you
want and `IMAGE_REGISTRY` to `ghcr.io/<owner>/<repo>`. To trace a running
container: `docker inspect --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}' <container>`.
Use the same SHA for all four images. Log in to GHCR on the server with a
read-only token (`docker login ghcr.io`) if the packages are private.

## Secrets

- The server keeps one file, `.env.prod`, mode 600, owned by the deploy
  user. Create it from `deploy/compose/env.prod.example`. It is ignored by
  git (`.env.*` in `.gitignore`); never commit it, never paste it in
  tickets or chat.
- A copy of every secret also lives in the team secret store, with
  `BACKUP_CIPHER_PASS` kept off the server's own backup bucket.
- Rotate `SMTP_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `BACKUP_S3_SECRET` by
  editing `.env.prod` and re-running the deploy command. Rotating
  `SESSION_SECRET` logs every user out.
- Compose fails at start with a clear message if a required variable is
  empty (`IMAGE_TAG`, `SESSION_SECRET`, `SMTP_*`, `GOOGLE_*`, `ACME_EMAIL`).

## One-time setup

### DNS and TLS

1. Add `A` (and `AAAA` if the host has IPv6) records for
   `conriskexpert.com` pointing to the server.
2. Open ports 80 and 443 to the internet; nothing else is published.
3. Caddy gets a Let's Encrypt certificate on first start (`ACME_EMAIL` in
   `.env.prod`). The `caddy-data` volume keeps it; do not delete the volume.

### Brevo (OTP e-mail)

1. In Brevo, add and verify the sending domain `conriskexpert.com`.
2. Publish the DNS records Brevo shows:
   - SPF: one TXT at the apex that includes Brevo, for example
     `v=spf1 include:spf.brevo.com ~all` (merge with any existing SPF).
   - DKIM: the `brevo1._domainkey` / `brevo2._domainkey` records Brevo gives.
   - DMARC: TXT `_dmarc` such as `v=DMARC1; p=none; rua=mailto:<ops mailbox>`;
     move to `quarantine` once reports are clean.
   - Brevo's `brevo-code` TXT verification record.
3. Create an SMTP key (SMTP & API, SMTP tab). `SMTP_USER` is the SMTP login
   shown there, `SMTP_PASSWORD` is the key.
4. Defaults in `compose.prod.yaml`: `smtp-relay.brevo.com`, port 587
   (STARTTLS), `SMTP_FROM=no-reply@conriskexpert.com`. Only `api` has
   outbound access (`egress-net`).

### Google sign-in

Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` the api still starts
and `/api/v1/auth/google/*` answers 503 `google_unavailable`. To enable it:

1. In Google Cloud Console open APIs & Services, OAuth consent screen and
   configure it (External, scopes `openid` and `email`; the api asks for no others).
2. Credentials, Create credentials, OAuth client ID, type Web application.
3. Authorized redirect URI: `PUBLIC_BASE_URL` + `/api/v1/auth/google/callback`,
   for example `https://conriskexpert.com/api/v1/auth/google/callback`.
4. Authorized JavaScript origin: the value of `PUBLIC_BASE_URL`
   (`https://conriskexpert.com`).
5. Put the client id and secret in `.env.prod` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. `PUBLIC_BASE_URL` must be set (it already is).
   Set `GOOGLE_REDIRECT_URL` only if the registered callback differs from
   the default above.
6. Redeploy the api and open the log-in page: the Google button should
   take you to `accounts.google.com`. The api's `POST /auth/google/start`
   (CSRF token plus body `{"intent":"login"}`) now answers 200 with an
   `authorization_url` on `accounts.google.com` instead of 503.

Optional limits: `RL_GOOGLE_IP_LIMIT`/`_WINDOW` (default 30 per 15m per IP)
and `RL_REPORT_REQUEST_LIMIT`/`_WINDOW` (default 10 per 10m per account).

### Backup

Set `BACKUP_ENABLED=true` and the `BACKUP_*` variables (bucket at a
different provider or region from the app host). Details, schedule and
restore steps are in [restore.md](restore.md).

## Deploy or upgrade

On the server, from the repository root, with the SHA in `.env.prod`:

```sh
export ENV_FILE=.env.prod COMPOSE_EXTRA=compose.prod.yaml
deploy/backup/deploy.sh pull --ignore-buildable
deploy/backup/deploy.sh up -d
```

The wrapper reads `ENV_FILE`, maps `BACKUP_ENABLED` to the `backup`
profile, runs preflight, builds the backup image and adds each file in
`COMPOSE_EXTRA` (space or comma separated; relative names resolve in
`deploy/compose`) after `compose.yaml` and `compose.backup.yaml`.
Without `COMPOSE_EXTRA` it behaves as before.

The `migrate` service runs to completion before `api` and `worker` start.
Without backup (staging only), set `BACKUP_ENABLED=false`.

## Verify

1. `deploy/backup/deploy.sh ps`: all services healthy, no `mailpit`.
2. `curl -fsS https://conriskexpert.com/api/v1/healthz`.
3. Sign up with an e-mail address: the OTP arrives from Brevo (check
   Brevo transactional logs if not).
4. Sign in with Google: the callback returns to the app.
5. Backup: `deploy/backup/deploy.sh exec backup pgbackrest --stanza=cre info`
   shows a full backup in repo1, then run the restore check from
   [restore.md](restore.md).
6. Confirm the SHA with the `docker inspect` command above.

## Roll back

Set `IMAGE_TAG` to the previous SHA and run the deploy commands again.
Migrations are forward only: if the bad release ran one, restore from
backup instead (see [restore.md](restore.md)), or ship a fix forward.

## Staging acceptance checklist (IO-80)

- [ ] Real OTP delivered through Brevo
- [ ] Google sign-in completes
- [ ] First full backup in the S3-compatible bucket, restore check passes
- [ ] Running images match the intended commit SHA
