# Security policies

Two rules that ASVS asks the project to write down. The checklist rows that rely on them are in [`asvs-l1.md`](asvs-l1.md).

## Anti-automation

Covers ASVS V6.1.1 and V6.3.1: how sign-in and sign-up are protected against password guessing and credential stuffing, and why an attacker cannot lock a user out for good.

### Rate limits

Every limit is a fixed window counted in Valkey, so all api replicas share one counter ([`ratelimit.go`](../../backend/internal/http/middleware/ratelimit.go)). The window starts at the first request for a key. Past the limit the api answers 429 `rate_limited` with `Retry-After`. Each limit can be changed without a code change through `<NAME>_LIMIT` (requests) and `<NAME>_WINDOW` (a Go duration such as `15m`, or whole days such as `1d`).

| Route | Name | Key | Default |
| --- | --- | --- | --- |
| `POST /auth/login` | `RL_LOGIN_IP` | client IP | 20 per 15 min |
| `POST /auth/login` | `RL_LOGIN_EMAIL` | e-mail in the body | 10 per 15 min |
| `POST /auth/register/start` | `RL_SIGNUP_IP` | client IP | 10 per hour |
| `POST /auth/register/start` | `RL_SIGNUP_EMAIL` | e-mail | 5 per hour |
| `POST /auth/register/verify` | `RL_OTP_IP` | client IP | 30 per 15 min |
| `POST /auth/register/verify` | `RL_OTP_EMAIL` | e-mail | 20 per 15 min |
| `POST /auth/register/resend` | `RL_OTP_RESEND_IP` | client IP | 10 per 15 min |
| `POST /auth/register/resend` | `RL_OTP_RESEND_MAIL` | e-mail | 5 per 15 min |
| `POST /auth/password/forgot` | `RL_RESET_REQ_IP` | client IP | 10 per hour |
| `POST /auth/password/forgot` | `RL_RESET_REQ_EMAIL` | e-mail | 5 per hour |
| `POST /auth/password/reset` | `RL_RESET_VERIFY_IP` | client IP | 20 per 15 min |
| `POST /auth/password/reset` | `RL_RESET_VERIFY_EMAIL` | e-mail | 10 per 15 min |
| Google sign-in routes | `RL_GOOGLE_IP` | client IP | 30 per 15 min |
| `PUT /account/password` | `RL_ACCOUNT_PASSWORD` | account | 10 per 15 min |
| `DELETE /account` | `RL_ACCOUNT_DELETE` | account | 5 per 15 min |
| `POST …/reports` | `RL_REPORT_REQUEST` | account | 10 per 10 min |

Where the limits are declared: [`login_routes.go`](../../backend/internal/http/handler/auth/login_routes.go), [`register_handler.go`](../../backend/internal/http/handler/auth/register_handler.go), [`google.go`](../../backend/internal/http/handler/auth/google.go), [`account/routes.go`](../../backend/internal/http/handler/account/routes.go) and [`wire.go`](../../backend/internal/http/wire.go). The test [`TestEveryDeclaredRateLimitIsTested`](../../backend/internal/securitytest/ratelimit_test.go) fails when a new limit has no test.

The client IP is the one Caddy reports. The api believes `X-Forwarded-For` only from the proxies in `TRUSTED_PROXIES`, so a client cannot pick its own IP key ([`TestRealIPIgnoresHeaderFromUntrustedPeer`](../../backend/internal/http/router_test.go)).

### One-time codes

Sign-up and password-reset codes have 6 random digits, live 10 minutes, are stored only as a salted hash, and are spent on first use. After 5 wrong codes the code is dropped and the user must ask for a new one. A new code can be sent once every 60 seconds ([`register.go`](../../backend/internal/service/auth/register.go), [`reset.go`](../../backend/internal/service/auth/reset.go)).

### No account lockout

* Nothing disables an account after failed attempts. Only an admin can deactivate an account.
* Each limit ends with its window. The per-e-mail login limit means someone who knows a user's e-mail can delay that user's password sign-in by up to 15 minutes at a time while they keep sending requests. The user can still sign in with Google if it is linked, and the password itself is never put at risk. This trade-off is accepted for Level 1.
* A wrong password, an unknown e-mail and a Google-only account get the same answer and take about the same time, so the login form does not reveal which e-mails exist ([`TestLoginFailures`](../../backend/internal/http/handler/auth/login_integration_test.go), [`TestLoginTimingSimilar`](../../backend/internal/service/auth/login_test.go)). Password reset answers the same for every e-mail ([`TestRequestCodeSameAnswerForAnyEmail`](../../backend/internal/service/auth/reset_test.go)).
* If Valkey fails, the limiter lets requests through and logs the error, so a Valkey outage does not lock everyone out ([`TestRateLimitEmptyKeySkipsAndStoreErrorFailsOpen`](../../backend/internal/http/middleware/ratelimit_test.go)).

## Dependency remediation

Covers ASVS V15.1.1 and V15.2.1: how fast a vulnerable third-party component must be fixed.

### Where findings come from

* **Go:** `govulncheck` runs in the `backend` job of [`ci.yml`](../../.github/workflows/ci.yml) and fails on any known vulnerability the code can reach. Because `ci-ok` is required, no backend change merges while one is open.
* **Go, npm and GitHub Actions:** Dependabot alerts and grouped security PRs ([`dependabot.yml`](../../.github/dependabot.yml), CONTRIBUTING "Dependabot PRs").
* **npm, on demand:** `pnpm audit --prod`.
* **Docker base images** are not covered by Dependabot; see the last rule below.

### Time frames

Counted from the day the advisory first reaches us through one of the sources above.

| Severity (CVSS or the advisory's own rating) | Fixed or mitigated within |
| --- | --- |
| Critical | 7 days |
| High | 14 days |
| Medium | 30 days |
| Low | 90 days, or the next release if sooner |

* "Mitigated" means the vulnerable code cannot be reached (shown by `govulncheck` or written down in the issue), or a workaround is in place. A real fix still follows within the next time frame.
* If a fix needs a major version that the fixed stack (AGENTS.md) does not allow, open an issue the same day, label it `needs-decision`, and record the mitigation there.

### General updates

Routine version bumps are off on purpose (CONTRIBUTING, "Dependabot PRs"). Apart from security fixes:

* The Go toolchain and Node stay on versions their upstream still supports. Check both at the start of every milestone and before each release.
* Docker base images (`golang`, `node`, `alpine`, `postgres`, `valkey`, `caddy`, `gotenberg`, `rustfs`) are checked once a month for a newer patch release, and updated within the time frames above when their advisories affect us.
