<div align="center">

# 🏝️ CRE · Construction Risk Expert

**Assess construction risk for island projects: answer 55 indicators, get scores, risk levels, advice and a PDF report.**

[![ci](https://github.com/suppakorn-tae/cre-website/actions/workflows/ci.yml/badge.svg)](https://github.com/suppakorn-tae/cre-website/actions/workflows/ci.yml)
[![e2e](https://github.com/suppakorn-tae/cre-website/actions/workflows/ci-e2e.yml/badge.svg)](https://github.com/suppakorn-tae/cre-website/actions/workflows/ci-e2e.yml)
![Go](https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[Quick start](#-quick-start) · [Commands](#-commands) · [Architecture](#-architecture) · [Repo layout](#-repo-layout) · [Docs](#-docs)

</div>

---

## ✨ Features

| | |
| --- | --- |
| 🔐 **Accounts** | Sign up by e-mail (OTP) or Google, log in, reset password, delete account |
| 📁 **Projects** | Projects with versions; older versions become read-only |
| 📝 **Assessment** | 55 indicators with unit pickers, autosave and server-side validation |
| 📊 **Results** | Stored scores and levels, heat map, H/VH advice and strategy choice |
| 📈 **Dashboard** | KPI cards, level distribution, version compare and RM trends |
| 📄 **Reports** | PDF reports rendered in the background, ready to download |
| 🛠️ **Admin** | Users, RL thresholds, impact tables, advice lists, audit log, pseudonymised research export |

The interface is in Thai.

---

## 🚀 Quick start

> **You need:** Docker with Compose, Go (see `backend/go.mod`), and Node from `.nvmrc` with corepack.

```sh
# 1. install
corepack enable
corepack pnpm install --frozen-lockfile

# 2. configure (then set SESSION_SECRET in the file, e.g. `openssl rand -hex 32`)
cp deploy/compose/.env.example deploy/compose/.env

# 3. run
make up
```

Open **<https://localhost>**. Caddy uses its own local CA, so accept the browser warning.
Check health with `curl -k https://localhost/api/v1/healthz`, stop with `make down`.

> [!NOTE]
> The api will not start without `SESSION_SECRET` (32+ bytes). Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty locally; Google sign-in then answers 503. Never commit `.env`.

<details>
<summary><b>👤 Get a local admin account</b> (dev only)</summary>

<br>

There is no admin sign-up. Sign up as a normal user, then promote the account. **Never do this on a real deployment.**

1. Sign up at <https://localhost> as, for example, `admin@example.com`.
2. Read the OTP from Mailpit (not published on the host, so ask from inside the network). It is in the `Subject` of the newest message:

   ```sh
   docker compose -f deploy/compose/compose.yaml exec caddy \
     wget -qO- http://mailpit:8025/api/v1/messages
   ```

3. Promote the account:

   ```sh
   docker compose -f deploy/compose/compose.yaml exec -T db psql -U cre_owner -d cre \
     -c "UPDATE account SET role = 'admin' WHERE email = 'admin@example.com'"
   ```

Change the user and database names if you changed `POSTGRES_USER` / `POSTGRES_DB`. The e2e suite does the same in `e2e/global-setup.ts`.

</details>

<details>
<summary><b>🎨 Work on the web only, with mocks</b></summary>

<br>

No backend needed. The browser answers every API call from `web/src/mocks`:

```sh
NEXT_PUBLIC_API_MOCKS=1 corepack pnpm --dir web dev
```

Then open <http://localhost:3000>.

</details>

---

## 🧰 Commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `make up` / `make down` | Start or stop the stack |
| `make gen` | Regenerate the OpenAPI bundle, Go server, sqlc code, TypeScript types and MSW worker |
| `make lint` | Spectral, golangci-lint, ESLint and the i18n check |
| `make test` | Backend and web tests (testcontainers, so Docker must run) |
| `make test-backend` / `make test-web` | One side only |
| `make build` | Build backend and web |

> [!IMPORTANT]
> Run `make gen lint test` before you push. Generated code is committed, and CI fails when it is stale.

<details>
<summary><b>🧪 End-to-end tests</b> (Playwright)</summary>

<br>

The suite runs on its own stack with throw-away secrets (`e2e/compose.env`). It also uses ports 80 and 443, so stop the dev stack first.

```sh
corepack pnpm --dir e2e exec playwright install chromium
corepack pnpm --dir e2e run stack:up
corepack pnpm --dir e2e test
corepack pnpm --dir e2e run stack:down
```

CI runs it nightly and on pull requests that touch `e2e/` ([`ci-e2e.yml`](.github/workflows/ci-e2e.yml)).

</details>

<details>
<summary><b>⚡ Load test</b> (k6)</summary>

<br>

Needs only Docker. It builds its own stack with two api replicas and seeds 500 users × 10 projects × 5 versions.

```sh
loadtest/run.sh up     # build, start and seed
loadtest/run.sh test   # run k6, 3 min by default (DURATION=1m to shorten)
loadtest/run.sh down   # stop and clean up
```

Latest numbers: every interactive endpoint is under 1 s at p95. See [`loadtest/RESULTS.md`](loadtest/RESULTS.md).

</details>

---

## 🏗️ Architecture

```mermaid
flowchart LR
    browser([Browser]) --> caddy[Caddy<br/>TLS]
    caddy --> web[Next.js web]
    caddy --> api[Go api]
    web -- server calls --> api
    api --> db[(PostgreSQL)]
    api --> valkey[(Valkey<br/>sessions · queue)]
    api --> s3[(RustFS<br/>S3 files)]
    worker[Go worker] --> db
    worker --> valkey
    worker --> s3
    worker --> gotenberg[Gotenberg<br/>PDF]
    api -. mail .-> mailpit[Mailpit<br/>dev only]
```

The api stores results when a version is submitted and never recalculates them on read. Reports and exports run as background jobs in the worker.

| Part | Technology |
| --- | --- |
| Backend | Go, chi, oapi-codegen, pgx + sqlc, asynq |
| Web | Next.js, TypeScript, next-intl, TanStack Query, MSW |
| Data | PostgreSQL 16, Valkey, RustFS (S3) |
| Other | Gotenberg (PDF), Caddy (proxy and TLS) |

Exact versions live in `backend/go.mod`, `.nvmrc` and `package.json`.

---

## 📂 Repo layout

```text
backend/     Go: cmd/ (api, worker, migrate), internal/ (http, service, engine, dal, worker), migrations/, seed/
web/         Next.js app, Thai catalogue in messages/th/, MSW mocks in src/mocks/
contracts/   OpenAPI contract and codegen config
deploy/      Compose files (compose/) and backups (backup/)
e2e/         Playwright tests and their stack
loadtest/    k6 scripts, seed data and runner
docs/        Specs (specs/) and runbooks (runbooks/)
```

---

## 📚 Docs

| | |
| --- | --- |
| 📐 [Specs](docs/specs/README.md) | Requirements, risk engine, architecture, database, UX/UI. **The source of truth.** |
| 🚢 [Deploy runbook](docs/runbooks/deploy.md) | Production deploy, including [Google sign-in setup](docs/runbooks/deploy.md#google-sign-in) |
| 💾 [Restore runbook](docs/runbooks/restore.md) | Backups and restore |
| 🤝 [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, commits, pull requests, required checks |
| 🤖 [AGENTS.md](AGENTS.md) | Rules for coding agents |
