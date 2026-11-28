# OWASP Top 10 mapping

**Standard:** [OWASP Top 10:2025](https://owasp.org/Top10/2025/), the final 2025 list. One section per category: how the app defends against it, where the code and tests are, which rows of the [ASVS Level 1 checklist](asvs-l1.md) cover it, and what is still open.

Checked on 28 Nov 2026. Open issues: [IO-269](https://linear.app/printf-scanf/issue/IO-269) (cookie prefixes), [IO-270](https://linear.app/printf-scanf/issue/IO-270) (common passwords).

| Category | Covered | Open |
| --- | --- | --- |
| [A01 Broken Access Control](#a012025-broken-access-control) | ✅ | — |
| [A02 Security Misconfiguration](#a022025-security-misconfiguration) | 🟡 | IO-269 |
| [A03 Software Supply Chain Failures](#a032025-software-supply-chain-failures) | ✅ | — |
| [A04 Cryptographic Failures](#a042025-cryptographic-failures) | ✅ | — |
| [A05 Injection](#a052025-injection) | ✅ | — |
| [A06 Insecure Design](#a062025-insecure-design) | ✅ | — |
| [A07 Authentication Failures](#a072025-authentication-failures) | 🟡 | IO-269, IO-270 |
| [A08 Software or Data Integrity Failures](#a082025-software-or-data-integrity-failures) | ✅ | — |
| [A09 Security Logging and Alerting Failures](#a092025-security-logging-and-alerting-failures) | 🟡 | alerting, see below |
| [A10 Mishandling of Exceptional Conditions](#a102025-mishandling-of-exceptional-conditions) | ✅ | — |

✅ the defences below are in place and tested · 🟡 in place with the open items listed.

## A01:2025 Broken Access Control

**Defence**

* Every request with a session goes through the session middleware, which loads the account's status, role and session version from the server, never from the token ([middleware/session.go][mw-session], [session.go][session]).
* `/admin` needs the admin role ([rbac.go][rbac]). There is **no admin bypass**: admins cannot open other users' projects, versions, answers, results or reports ([architecture decisions][decisions-authz]).
* Every project, version, answer, result, report and job query carries the session user's id. Not owned or soft-deleted answers 404, so ids cannot be probed.
* CSRF: double-submit token plus `Origin` check on every state-changing request ([csrf.go][csrf]).
* Same origin through Caddy, so no CORS headers are sent at all.

**Tests:** [security_test.go][sectest] runs the real router against Postgres and Valkey: `TestSessionRequired`, `TestCSRFOnEveryMutation`, `TestAdminRoutesRefuseUsers`, `TestObjectLevelAuthorisation`, `TestListsOnlyShowOwnProjects`, `TestSoftDeletedProjectIs404`, `TestReportDownloadIsOwnerOnly`, `TestDashboardPanelsOnlyShowOwnProjects`. [coverage_test.go][sectest-cov] fails when a contract route has no security coverage.

**ASVS rows:** V8.1.1, V8.2.1, V8.2.2, V8.3.1, V3.4.2, V3.5.1, V3.5.3, V7.2.1.

**Left:** nothing open at Level 1.

## A02:2025 Security Misconfiguration

**Defence**

* Caddy sets HSTS (one year, `includeSubDomains`), `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and hides `Server` ([Caddyfile.prod][caddy-prod]). The api paths get a deny-all CSP.
* Pages get a per-request nonce CSP with no `'unsafe-eval'` in production ([csp.ts][csp], [proxy.ts][proxy]).
* The api refuses to start in production without a 32-byte `SESSION_SECRET` or an SMTP host ([config.go][config]). Cookies are `Secure` outside local development.
* No default accounts; the first admin is promoted by hand ([dev runbook][dev-admin]).
* Images copy only built output, and `.git` is excluded from every build context ([`.dockerignore`][dockerignore]).

**Tests:** [caddyfile_test.sh][caddy-test] (header lines in both Caddyfiles), [security-headers.spec.ts][headers-spec] (headers on a live page and on the api), [csp.test.ts][csp-test], and the CSP guard in every e2e spec ([helpers/test.ts][csp-guard]).

**ASVS rows:** V3.2.1, V3.3.1, V3.4.1, V4.1.1, V6.3.2, V12.1.1, V13.4.1.

**Left**

* Cookie names have no `__Host-` prefix: [IO-269](https://linear.app/printf-scanf/issue/IO-269).
* TLS version and the `.git` exclusion are checked by review only (see [Gaps](asvs-l1.md#gaps)). The ZAP baseline scan ([`e2e/zap`](../../e2e/zap/scan.sh), job `zap` in [ci-e2e.yml](../../.github/workflows/ci-e2e.yml)) fails CI on any medium or high alert, but it scans the e2e stack over plain http, so it does not test TLS.

## A03:2025 Software Supply Chain Failures

**Defence**

* `govulncheck` and `gosec` run in the required `backend` CI job ([ci.yml][ci]).
* Dependabot opens security PRs for Go, npm and GitHub Actions ([dependabot.yml][dependabot]).
* Remediation time frames by severity are written down ([policies.md][policies-deps]).
* Lockfiles are committed and installs use `pnpm install --frozen-lockfile` and `go.sum`. Production images are pulled by digest (`deploy/compose/compose.prod.yaml`).
* The stack is fixed (AGENTS.md), and every new dependency must be justified in its PR.

**Tests:** the `govulncheck` step in [ci.yml][ci] fails the build on a reachable Go vulnerability.

**ASVS rows:** V15.1.1, V15.2.1.

**Left:** npm has no CI gate like `govulncheck` (Dependabot alerts and `pnpm audit` only). Docker base images are not covered by Dependabot; [policies.md][policies-deps] asks for a monthly check.

## A04:2025 Cryptographic Failures

**Defence**

* Passwords: Argon2id, 19 MiB, 2 passes, random salt ([register_crypto.go][crypto]).
* Sessions: HMAC-SHA256 with a secret of at least 32 bytes, fixed header, constant-time compare ([session.go][session]).
* OTPs: `crypto/rand`, stored as a salted SHA-256 hash, compared in constant time.
* HTTPS only, with HSTS and Let's Encrypt certificates ([Caddyfile.prod][caddy-prod]). No MD5, SHA-1, DES or RC4 anywhere; `gosec` flags them.

**Tests:** `TestPasswordHashing` and `TestOTPAndPseudonymShape` in [register_test.go][register-test], `TestTokenValidation` and `TestShortSecretRejected` in [session_test.go][session-test].

**ASVS rows:** V11.3.1, V11.3.2, V11.4.1, V12.1.1, V12.2.1, V12.2.2, V9.1.1, V9.1.2, V9.1.3.

**Also:** The OTP mailer refuses to send without STARTTLS in production (`SMTP_REQUIRE_TLS` defaults to true; `TestSendRequireTLSFailsWithoutStartTLS` in [mailer_test.go](../../backend/internal/adapter/mailer/mailer_test.go)).

**Left:** nothing open at Level 1.

## A05:2025 Injection

**Defence**

* SQL: every app query is written in [`dal/queries`][queries] and generated by sqlc with `$n` parameters. No query is built from strings.
* HTML: React escapes text; the PDF report uses Go `html/template`, which escapes per context ([report.go][report-tmpl]).
* No `eval`, no OS commands, no XML parsing. The CSP blocks inline and evaluated script in production.
* Input is validated on the server against the OpenAPI contract, with unknown fields rejected.

**Tests:** `TestRenderEscapesUserText` in [report_test.go][report-tmpl-test], `TestLikePattern` in [projects_internal_test.go][projects-test], `TestValidateAnswers` in [answers_test.go][answers-test], [csp.test.ts][csp-test], and the CSP guard in every e2e spec ([helpers/test.ts][csp-guard]).

**ASVS rows:** V1.2.1, V1.2.2, V1.2.3, V1.2.4, V1.2.5, V1.3.1, V1.3.2, V1.5.1, V2.2.1, V2.2.2, V3.2.2.

**Left:** nothing open at Level 1.

## A06:2025 Insecure Design

**Defence**

* Contract first: the OpenAPI spec defines every input, and handler tests check responses against it ([contract.go][contract-helper]).
* Layers point downward (handler → service → repository); authorisation sits in services and repositories, not in the web app ([architecture decisions][decisions-authz]).
* Flows are state machines on the server: an account is created only after the OTP; codes and Google state are single use; submit checks the version state.
* Results are stored at submit and never recalculated on read, so a read cannot change data.
* Rate limits and anti-automation are designed and documented ([policies.md][policies-rl]).

**Tests:** `TestStartThenVerifyCreatesAccountOnlyAfterOTP` in [register_test.go][register-test], `TestResetConcurrentSameCodeSucceedsOnce` in [reset_test.go][reset-test], `TestGoogleStateReplayedOrExpired` in [google_test.go][google-h-test], `TestSubmitGuards` in [submit_integration_test.go][submit-int].

**ASVS rows:** V2.1.1, V2.3.1, V6.1.1, V8.1.1, V15.3.1.

**Left:** nothing open at Level 1. There is no written threat model; that is a Level 2 item.

## A07:2025 Authentication Failures

**Defence**

* Passwords of 8 to 128 characters, any characters, compared exactly as typed. Change needs the current password.
* Rate limits per IP and per e-mail on log in, sign-up, OTP and reset; 5 wrong OTPs drop the code. No permanent lockout ([policies.md][policies-rl]).
* Same answer and similar timing for a wrong password, an unknown e-mail and a Google-only account.
* Sessions are checked on the server on every request. A sign-in replaces the old token; log out revokes the token on the server; password reset, deactivation and deletion end every session of the account.
* Google sign-in: code flow with PKCE, `state` and `nonce`, ID token checked on the server (signature, `iss`, `aud`, `exp`, `nonce`, verified e-mail) ([oidc.go][oidc]).

**Tests:** [login_integration_test.go][login-h-test] (`TestLoginLogout`, `TestLoginFailures`, `TestPasswordResetEndsOtherSessions`), [session_test.go][session-test] (`TestRevokeEndsOnlyThatToken`, `TestRevocationCheckFailsClosed`, `TestBumpEndsOldSessionsAtOnce`), `TestPasswordIsCheckedExactly` and `TestLoginTimingSimilar` in [login_test.go][login-test], [ratelimit_test.go][sectest-rl], [oidc_test.go][oidc-test].

**ASVS rows:** V6.1.1 to V6.4.2, V7.2.1 to V7.4.2, V9.2.1, V14.3.1.

**Left**

* No check against common passwords: [IO-270](https://linear.app/printf-scanf/issue/IO-270).
* No `__Host-` cookie prefix: [IO-269](https://linear.app/printf-scanf/issue/IO-269).
* No second factor. It is not required at Level 1.

## A08:2025 Software or Data Integrity Failures

**Defence**

* Session tokens are signed and checked before use; Google ID tokens are checked against Google's keys from the configured issuer only.
* No client-side deserialisation of untrusted objects: the api reads JSON into typed structs with unknown fields rejected.
* The audit log is append-only at the database level: the application role may only `INSERT` and `SELECT` on `audit_log` ([architecture decisions][decisions-audit]).
* Generated code (sqlc, oapi-codegen, OpenAPI types) is committed, and CI fails when it is stale.
* Production images are pinned by digest.

**Tests:** `TestTokenValidation` in [session_test.go][session-test], `TestVerifyRejects` in [oidc_test.go][oidc-test], `TestAuditHasNoWriteRoutes` in [audit_integration_test.go][audit-test], and `TestAuditLogAppendOnlyForApplicationRole` in [accounts_jobs_audit_test.go][audit-grants-test].

**ASVS rows:** V9.1.1, V9.1.2, V9.1.3, V9.2.1.

**Left:** nothing open at Level 1. Build provenance and image signing are not in place.

## A09:2025 Security Logging and Alerting Failures

**Defence**

* Every admin action (role, deactivate, reactivate, delete, advice, thresholds, impact tables, export request and download) writes one audit row in the same transaction as the change: time, admin, action, target, old and new values, request id and client IP ([architecture decisions][decisions-audit]).
* Request logs are JSON with a request id and the client IP from Caddy only (`TestRequestLogCarriesRequestIDAndRealIP` in [router_test.go][router-test]).
* Error responses carry the request id, so a user report can be matched to the logs; they never carry stack traces.
* The api and worker expose Prometheus metrics, including failed OTP e-mails.

**Tests:** [audit_integration_test.go][audit-test], `TestSessionPutsAuditContextOnAdminRequests` in [session_test.go][mw-session-test], [router_test.go][router-test].

**ASVS rows:** none; V16 has no Level 1 requirements.

**Left:** failed sign-ins and rate-limit hits are not counted in metrics, and no alert rules ship with the repo. This is a Level 2 item.

## A10:2025 Mishandling of Exceptional Conditions

**Defence**

* A panic in a handler is recovered and answered with the standard JSON error, never a stack trace (`TestRecovererReturnsEnvelope` in [base_test.go][base-test]).
* Every request has a time limit (`TestTimeoutReturns504`).
* Security checks fail closed: an unknown account, a failed account load or a failed revocation check refuses the session ([session.go][session]; `TestRevocationCheckFailsClosed`). Only the rate limiter fails open, on purpose, so a Valkey outage does not lock users out ([policies.md][policies-rl]).
* Multi-step writes run in one transaction and roll back on any error (`TestSubmitRollsBackOnAnyFailure` in [submit_integration_test.go][submit-int]).

**Tests:** as linked above.

**ASVS rows:** V7.4.1, V2.3.1.

**Left:** nothing open at Level 1.

[mw-session]: ../../backend/internal/http/middleware/session.go
[mw-session-test]: ../../backend/internal/http/middleware/session_test.go
[session]: ../../backend/internal/service/session/session.go
[session-test]: ../../backend/internal/service/session/session_test.go
[rbac]: ../../backend/internal/http/middleware/rbac.go
[csrf]: ../../backend/internal/http/middleware/csrf.go
[sectest]: ../../backend/internal/securitytest/security_test.go
[sectest-cov]: ../../backend/internal/securitytest/coverage_test.go
[sectest-rl]: ../../backend/internal/securitytest/ratelimit_test.go
[decisions-authz]: ../specs/architecture/cre-architecture-decisions.md#authorisation-and-deletion
[decisions-audit]: ../specs/architecture/cre-architecture-decisions.md#audit-log
[caddy-prod]: ../../deploy/compose/Caddyfile.prod
[caddy-test]: ../../deploy/test/caddyfile_test.sh
[headers-spec]: ../../e2e/tests/meta/security-headers.spec.ts
[csp-guard]: ../../e2e/helpers/test.ts
[csp]: ../../web/src/lib/security/csp.ts
[csp-test]: ../../web/src/lib/security/csp.test.ts
[proxy]: ../../web/src/proxy.ts
[config]: ../../backend/internal/config/config.go
[dev-admin]: ../runbooks/dev.md#local-admin-account
[dockerignore]: ../../.dockerignore
[ci]: ../../.github/workflows/ci.yml
[dependabot]: ../../.github/dependabot.yml
[policies-deps]: policies.md#dependency-remediation
[policies-rl]: policies.md#anti-automation
[crypto]: ../../backend/internal/service/auth/register_crypto.go
[register-test]: ../../backend/internal/service/auth/register_test.go
[queries]: ../../backend/internal/dal/queries/
[report-tmpl]: ../../backend/templates/report/report.go
[report-tmpl-test]: ../../backend/templates/report/report_test.go
[projects-test]: ../../backend/internal/service/projects/projects_internal_test.go
[answers-test]: ../../backend/internal/service/assessments/answers_test.go
[contract-helper]: ../../backend/internal/testutil/contract/contract.go
[reset-test]: ../../backend/internal/service/auth/reset_test.go
[google-h-test]: ../../backend/internal/http/handler/auth/google_test.go
[submit-int]: ../../backend/internal/service/assessments/submit_integration_test.go
[login-h-test]: ../../backend/internal/http/handler/auth/login_integration_test.go
[login-test]: ../../backend/internal/service/auth/login_test.go
[oidc]: ../../backend/internal/adapter/oidc/oidc.go
[oidc-test]: ../../backend/internal/adapter/oidc/oidc_test.go
[audit-test]: ../../backend/internal/http/handler/admin/audit_integration_test.go
[audit-grants-test]: ../../backend/cmd/migrate/accounts_jobs_audit_test.go
[router-test]: ../../backend/internal/http/router_test.go
[base-test]: ../../backend/internal/http/middleware/base_test.go
