# OWASP ASVS Level 1 checklist

**Standard:** OWASP Application Security Verification Standard **5.0.0** (released 30 May 2025), the newest release on [OWASP/ASVS](https://github.com/OWASP/ASVS/releases) on 28 Nov 2026. Level 1 has 70 requirements. All of them are listed below, with the requirement IDs as published and a short paraphrase of each (read the standard for the full text).

**Scope:** the api, worker and migrate binaries (`backend/`), the web app (`web/`), the OpenAPI contract and the production deploy config (`deploy/compose/`). Checked on 28 Nov 2026 against `main` plus this change.

The Top 10 view of the same evidence is in [`owasp-top-10.md`](owasp-top-10.md). Rules ASVS asks us to document are in [`policies.md`](policies.md).

## Summary

| Status | Rows |
| --- | ---: |
| Pass | 51 |
| &nbsp;&nbsp;of which Pass (code and test) | 44 |
| &nbsp;&nbsp;of which Pass (absence) | 4 |
| &nbsp;&nbsp;of which Pass (review) | 3 |
| Fail | 3 |
| N/A | 16 |
| **Total** | **70** |

### Open fails

| ID | What is missing | Issue |
| --- | --- | --- |
| V3.3.1 | Cookies have no `__Host-` or `__Secure-` prefix | [IO-269](https://linear.app/printf-scanf/issue/IO-269) |
| V6.2.4 | New passwords are not checked against a common-password list | [IO-270](https://linear.app/printf-scanf/issue/IO-270) |
| V12.2.1 | The mailer may send without STARTTLS in production | [IO-271](https://linear.app/printf-scanf/issue/IO-271) |

### Fixed in this change (IO-267)

| ID | Fix |
| --- | --- |
| V6.1.1 | Rate limits, lockout behaviour and settings written down in [`policies.md`](policies.md#anti-automation) |
| V6.2.8 | New test proves passwords are compared exactly as typed |
| V7.2.4 | A sign-in ends the session the browser had before |
| V7.4.1 | Log out ends the token on the server, not only in the browser |
| V14.3.1 | Log out and sign-in clear the cached API data and the tab storage in the browser |
| V15.1.1 | Remediation time frames written down in [`policies.md`](policies.md#dependency-remediation) |
| V1.2.1 | New test proves the PDF report escapes user text (the escaping was already there) |

## How to read the rows

* **Pass:** the evidence names the code that meets the requirement and the test that proves it (test names in backticks are Go or Vitest test functions in the linked file).
* **Pass (review):** met by configuration that no automated test checks yet. The evidence says what was reviewed. These rows are listed under [Gaps](#gaps).
* **Pass (absence):** the requirement asks for something *not* to exist. The evidence is the command that shows it is absent; run it from the repo root.
* **Fail:** not met. The row links the open issue.
* **N/A:** the feature the requirement is about does not exist in this app. The row says why.

Integration tests (files ending in `_integration_test.go`, and the `securitytest` package) need Docker and run in CI.

## V1 Encoding and Sanitization

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V1.2.1 | Output is encoded for its context (HTML, attributes, CSS, HTTP headers) | Pass | Web: React escapes all text it renders. PDF report: Go `html/template` escapes per context, including the CSS running header ([report.go][report-tmpl]; `TestRenderEscapesUserText` in [report_test.go][report-tmpl-test]). Download headers are built with `mime.FormatMediaType` ([reports.go][reports-svc]; `Content-Disposition` checks in [reports_test.go][reports-h-test]). |
| V1.2.2 | URLs built from data are encoded, and only safe URL schemes are allowed | Pass | The Google URL is built with `url.Values` ([oidc.go][oidc]; `TestAuthURLCarriesPKCEStateAndNonce` in [oidc_test.go][oidc-test]). The callback redirect goes to a fixed page with an escaped result code ([google.go][google-h]; `TestGoogleCallbackRejects` in [google_test.go][google-h-test]). Web links use only ids from the api; the app never renders a URL a user typed. |
| V1.2.3 | JavaScript and JSON output is built with encoding, not string joining | Pass | All JSON goes through `encoding/json` ([errors.go][errors]; `TestWriteErrorShape` in [base_test.go][base-test]). The two inline scripts are constants with a nonce ([theme-script.tsx][theme-script]; [layout.test.tsx][layout-test]). |
| V1.2.4 | Database queries are parameterised | Pass | All app queries are sqlc-generated from [`dal/queries`][queries] with `$n` parameters. The seed uses parameters ([apply.go][seed-apply]); the role password is quoted by Postgres `format('%I', '%L')` ([approle.go][approle]; [approle_test.go][approle-test]). Search input is escaped for `LIKE` (`TestLikePattern` in [projects_internal_test.go][projects-test]). |
| V1.2.5 | OS commands are protected from injection | N/A | The app runs no OS commands. Check: `grep -rln "os/exec" backend --include=*.go | grep -v _test.go` finds nothing (only test helpers use it). PDFs are rendered by Gotenberg over HTTP. |
| V1.3.1 | HTML from rich-text editors is sanitised | N/A | No rich-text or HTML input. Every user field is plain text. |
| V1.3.2 | No `eval()` or other dynamic code execution | Pass | No `eval` or `new Function` in `web/src` or the backend. The production CSP has no `'unsafe-eval'`, so the browser blocks it too ([csp.ts][csp]; "never allows eval or inline scripts in production" in [csp.test.ts][csp-test]). |
| V1.5.1 | XML parsers are configured safely (no external entities) | N/A | The app parses no XML. Check: `grep -rn "encoding/xml" backend --include=*.go` finds nothing. |

## V2 Validation and Business Logic

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V2.1.1 | Documentation defines the input validation rules | Pass | The OpenAPI contract defines formats, lengths, enums and ranges for every request ([openapi.yaml][openapi], [schemas][schemas]). Handler tests check responses against it ([contract.go][contract-helper]). |
| V2.2.1 | Input is validated against expected values, patterns and ranges | Pass | Sign-up ([register.go][register]; `TestStartValidation` in [register_test.go][register-test]), projects (`TestValidate` in [projects_internal_test.go][projects-test]), answers ([answers.go][answers]; `TestValidateAnswers` in [answers_test.go][answers-test]). Unknown JSON fields are rejected ([login.go][login-h]). |
| V2.2.2 | Validation is enforced on the server, not only in the browser | Pass | The api validates every request itself; web checks are only for usability. `TestStartValidation` in [register_integration_test.go][register-h-test] and `TestUpsertRejectsInvalidAndUnknownWithoutWriting` in [answers_integration_test.go][answers-int] send bad input straight to the api. |
| V2.3.1 | Multi-step flows run in order and steps cannot be skipped | Pass | The account exists only after the OTP is verified (`TestStartThenVerifyCreatesAccountOnlyAfterOTP` in [register_test.go][register-test]). A reset code works once (`TestResetConcurrentSameCodeSucceedsOnce` in [reset_test.go][reset-test]). Google state is single use (`TestGoogleStateReplayedOrExpired` in [google_test.go][google-h-test]). Submit checks the version state (`TestSubmitGuards` in [submit_integration_test.go][submit-int]). |

## V3 Web Frontend Security

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V3.2.1 | Responses cannot be rendered in the wrong context (for example an API response opened as a page) | Pass | `/api/v*` gets `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and every response gets `nosniff` ([Caddyfile.prod][caddy-prod]; [caddyfile_test.sh][caddy-test]; "the api has a deny-all policy" in [security-headers.spec.ts][headers-spec]). Downloads have a fixed type and `attachment` by default ([reports.go][reports-h]; [reports_test.go][reports-h-test]). |
| V3.2.2 | Text is rendered as text, not as HTML | Pass | React renders strings as text. The only `dangerouslySetInnerHTML` uses are the two constant scripts ([theme-script.tsx][theme-script]). Every e2e spec fails on any CSP violation, so injected script would be caught ([helpers/test.ts][csp-guard]). |
| V3.3.1 | Cookies are `Secure` and use the `__Host-` (or at least `__Secure-`) prefix | **Fail** | Cookies are `Secure` in production (`TestCookies` in [session_test.go][session-test]) but named `cre_session` and `cre_csrf` without a prefix. The names are in the contract. [IO-269](https://linear.app/printf-scanf/issue/IO-269) |
| V3.4.1 | Every response has HSTS with a max-age of at least one year | Pass | `Strict-Transport-Security: max-age=31536000; includeSubDomains` on the whole site ([Caddyfile.prod][caddy-prod]; "prod hsts" in [caddyfile_test.sh][caddy-test]). |
| V3.4.2 | CORS `Access-Control-Allow-Origin` is fixed or checked against an allow list | Pass (absence) | The browser calls the api on the same origin through Caddy, so no CORS header is ever sent. Check: `grep -rni "access-control" backend/internal web/src deploy/compose` finds nothing. |
| V3.5.1 | Cross-site requests to sensitive functions are rejected (anti-forgery token or a non-safelisted header) | Pass | Double-submit token in `X-CSRF-Token` plus an `Origin` check on every POST, PUT, PATCH and DELETE ([csrf.go][csrf]; `TestCSRF` in [csrf_test.go][csrf-test]; `TestCSRFOnEveryMutation` in [security_test.go][sectest]). |
| V3.5.2 | If CORS preflight is the defence, it cannot be bypassed | N/A | The app does not rely on preflight; it uses the token in V3.5.1. |
| V3.5.3 | Sensitive functions use POST, PUT, PATCH or DELETE, not GET | Pass | Every state change is a non-GET operation in the contract and is covered by the CSRF test above. The only GET with side effects is the Google callback, which OAuth requires, and it needs the single-use state bound to this browser's cookie (`TestGoogleCallbackRejects` in [google_test.go][google-h-test]). |

## V4 API and Web Service

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V4.1.1 | Every response body has a matching `Content-Type`, with a charset for text types | Pass | JSON is `application/json` ([errors.go][errors]); downloads are `application/pdf` and `application/zip`; e-mail is `text/plain; charset=utf-8` ([mailer.go][mailer]); pages are `text/html; charset=utf-8` (Next.js). Handler tests check each response type against the contract ([contract.go][contract-helper]). |
| V4.4.1 | WebSockets use TLS (WSS) | N/A | The app has no WebSockets; the web app polls job status over HTTPS. |

## V5 File Handling

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V5.2.1 | Uploaded files have a size limit | N/A | The app accepts no file uploads. JSON bodies are size-capped (`http.MaxBytesReader` in [login.go][login-h]). |
| V5.2.2 | Uploaded files have their extension and content checked | N/A | No file uploads. |
| V5.3.1 | Files stored in a public folder cannot be run as server code | N/A | No public upload folder. Generated PDFs and ZIPs live in a private bucket and are streamed by the api after an ownership check. |
| V5.3.2 | File paths are built from trusted data, not user file names | Pass | Object keys are `reports/<job uuid>.pdf` and `exports/<job uuid>.zip` ([jobs.go][jobs-svc]; `TestRunnerUploadsToDeterministicKey` in [report_test.go][report-worker-test]). |

## V6 Authentication

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V6.1.1 | Documentation says how rate limits and anti-automation stop credential stuffing and brute force, how they are set, and how they avoid malicious lockout | Pass | [policies.md, Anti-automation][policies-rl] (added in this change). |
| V6.2.1 | Passwords are at least 8 characters | Pass | 8 to 128 characters at sign-up, reset and change ([register.go][register], [reset.go][reset], [account.go][account-svc]; `TestStartValidation` in [register_test.go][register-test]; `TestResetPasswordValidationKeepsCode` in [reset_test.go][reset-test]; `TestChangePassword` in [handler_integration_test.go][account-test]). |
| V6.2.2 | Users can change their password | Pass | `PUT /account/password` ([account.go][account-svc]; `TestChangePassword` in [handler_integration_test.go][account-test]). |
| V6.2.3 | Changing the password needs the current and the new password | Pass | `current_password_incorrect` when the current one is wrong (`TestChangePassword` in [handler_integration_test.go][account-test]). |
| V6.2.4 | New passwords are checked against at least the 3,000 most common passwords | **Fail** | Only the length is checked. Adding a check needs a new error code in the contract. [IO-270](https://linear.app/printf-scanf/issue/IO-270) |
| V6.2.5 | No rules on character types | Pass | Length is the only rule (`TestStartValidation` in [register_test.go][register-test]). |
| V6.2.6 | Password fields use `type=password` | Pass | [PasswordInput.tsx][password-input] starts masked and can be shown on request ([password-input.test.tsx][password-input-test]). |
| V6.2.7 | Paste and password managers work | Pass (absence) | No field blocks paste, and the password fields carry `autocomplete="current-password"` or `"new-password"`. Check: `grep -rn "onPaste" web/src` finds only the OTP input ([OtpInput.tsx][otp-input]), which accepts a pasted code and spreads it over the boxes; it is not a password field. |
| V6.2.8 | The password is checked exactly as typed (no trimming, case change or truncation) | Pass | Argon2id over the full input ([register_crypto.go][crypto]); handlers do not trim passwords ([login.go][login-h]). `TestPasswordIsCheckedExactly` in [login_test.go][login-test] (added in this change). |
| V6.3.1 | Brute-force and credential-stuffing controls are in place as documented | Pass | Limits in [ratelimit.go][ratelimit] as listed in [policies.md][policies-rl]; `TestRateLimitsOnPublicAuthRoutes` and `TestEveryDeclaredRateLimitIsTested` in [ratelimit_test.go][sectest-rl]; 5-wrong-codes rule in `TestSixthWrongCodeInvalidatesPendingSignup` ([register_test.go][register-test]). |
| V6.3.2 | No default accounts such as `admin` or `root` | Pass (absence) | No migration or seed creates an account; the first admin is a normal sign-up promoted by hand ([dev runbook][dev-admin]). Check: `grep -rln "INSERT INTO account" backend/migrations backend/seed backend/internal/seed` finds nothing. |
| V6.4.1 | System-made codes are random, follow policy and expire quickly or after one use | Pass | 6-digit OTPs from `crypto/rand`, 10-minute life, single use ([register_crypto.go][crypto]; `TestOTPAndPseudonymShape` and `TestCodeExpiresAfterTenMinutes` in [register_test.go][register-test]; `TestResetConcurrentSameCodeSucceedsOnce` in [reset_test.go][reset-test]). An OTP is never a password. |
| V6.4.2 | No password hints or secret questions | Pass (absence) | The contract has no hint or question field ([auth.yaml][auth-yaml]), and handlers reject unknown fields. Check: `grep -rniE "hint\|secret_question" contracts/openapi` finds nothing. |

## V7 Session Management

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V7.2.1 | Session tokens are checked on a trusted backend | Pass | The api checks the token and loads the account on every request ([middleware/session.go][mw-session]; `TestSessionMiddleware` in [session_test.go][mw-session-test]; `TestSessionRequired` in [security_test.go][sectest]). |
| V7.2.2 | Session tokens are generated per session, not static keys | Pass | A new signed token at every sign-in, with a random id ([session.go][session]; `TestRevokeEndsOnlyThatToken` in [session_test.go][session-test]). |
| V7.2.3 | Reference tokens are unique, from a CSPRNG, with 128 bits of entropy | N/A | Sessions use a self-contained signed token (see V9), not a reference token. The token still carries a 128-bit random id (added in this change). |
| V7.2.4 | A new token is issued at each sign-in and the previous one is ended | Pass | Password, sign-up and Google sign-in end the session the browser sent and set a new one (`replaceSession` in [logout.go][logout]; `TestLoginLogout` in [login_integration_test.go][login-h-test]). Fixed in this change. |
| V7.4.1 | After logout or expiry the session cannot be used again | Pass | Log out revokes the token in Valkey until it expires, and a revocation check that cannot reach Valkey refuses the request ([session.go][session]; `TestRevokeEndsOnlyThatToken`, `TestRevocationCheckFailsClosed` and `TestExpiryAndLifetimes` in [session_test.go][session-test]; `TestLoginLogout` in [login_integration_test.go][login-h-test]). Fixed in this change; before it, log out only cleared the browser cookie. |
| V7.4.2 | Disabling or deleting an account ends all its sessions | Pass | Deactivate and delete raise the session version ([admin/users.go][admin-users]; `TestDeactivateEndsSessionAndReactivate` in [users_integration_test.go][admin-users-test]; `TestDeactivatedAccountSessionIsRefused` in [security_test.go][sectest]; `TestDeleteWithPassword` in [handler_integration_test.go][account-test]). |

## V8 Authorization

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V8.1.1 | Documentation defines function-level and data-level access rules | Pass | [Architecture decisions, Authorisation and deletion][decisions-authz]: every query carries the session user's id, admins have no bypass, foreign or deleted rows answer 404. Tested by [security_test.go][sectest]. |
| V8.2.1 | Functions are limited to callers with the right permission | Pass | `/admin` needs the admin role, read from the account record ([rbac.go][rbac]; `TestRequireRole` in [session_test.go][mw-session-test]; `TestAdminRoutesRefuseUsers` in [security_test.go][sectest]). |
| V8.2.2 | Data access is limited to the owner (no IDOR or BOLA) | Pass | `TestObjectLevelAuthorisation`, `TestListsOnlyShowOwnProjects`, `TestReportDownloadIsOwnerOnly` and `TestDashboardPanelsOnlyShowOwnProjects` in [security_test.go][sectest]; every contract route must be covered ([coverage_test.go][sectest-cov]). |
| V8.3.1 | Authorisation is enforced on the server | Pass | All checks are in the api middleware and services; the web app only hides links. Same tests as V8.2.1 and V8.2.2. |

## V9 Self-contained Tokens

The session cookie holds an HS256 token signed by the api. Google ID tokens are RS256 tokens checked once at sign-in.

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V9.1.1 | Tokens are verified by signature or MAC before use | Pass | Session: HMAC checked in constant time before the payload is read ([session.go][session]; `TestTokenValidation` in [session_test.go][session-test]). Google: RS256 against Google's keys ([oidc.go][oidc]; `TestVerifyRejects` in [oidc_test.go][oidc-test]). |
| V9.1.2 | Only allow-listed algorithms; never `none` | Pass | The session header must equal the fixed HS256 header, so `alg: none` fails (`TestTokenValidation`). Google tokens must be RS256 (`TestVerifyRejects`). |
| V9.1.3 | Keys come from trusted, preset sources; `jku`, `x5u` and `jwk` headers are not trusted | Pass | Session key from `SESSION_SECRET`, at least 32 bytes (`TestShortSecretRejected` in [session_test.go][session-test]). Google keys only from the JWKS of the configured issuer (`TestDiscoveryIssuerMismatch` in [oidc_test.go][oidc-test]); token headers other than `kid` and `alg` are ignored. |
| V9.2.1 | Tokens are accepted only inside their validity period | Pass | Session `exp` (`TestExpiryAndLifetimes` in [session_test.go][session-test]); Google `exp` and `iat` (`TestVerifyRejects` in [oidc_test.go][oidc-test]). |

## V10 OAuth and OIDC

The app is an OAuth client of Google. It is not an authorization server, and every Level 1 requirement in V10 is for authorization servers.

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V10.4.1 | The authorization server matches redirect URIs exactly | N/A | Not an authorization server (Google is). |
| V10.4.2 | Authorization codes are single use | N/A | Not an authorization server. |
| V10.4.3 | Authorization codes are short-lived | N/A | Not an authorization server. |
| V10.4.4 | Each client may use only the grants it needs; no implicit or password grant | N/A | Not an authorization server. The app itself uses only the code flow with PKCE (`TestAuthURLCarriesPKCEStateAndNonce` in [oidc_test.go][oidc-test]). |
| V10.4.5 | Refresh-token replay is prevented | N/A | Not an authorization server, and the app keeps no Google refresh token. |

## V11 Cryptography

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V11.3.1 | No insecure block modes or paddings (ECB, PKCS#1 v1.5) | N/A | The app encrypts nothing itself. Check: `grep -rnE "crypto/(aes\|cipher\|des\|rc4)" backend --include=*.go` finds nothing. TLS is Caddy's (V12). |
| V11.3.2 | Only approved ciphers and modes such as AES-GCM | N/A | Same reason as V11.3.1. |
| V11.4.1 | Only approved hash functions; no MD5 for any cryptographic use | Pass | Argon2id for passwords, SHA-256 for OTP hashes and HMAC-SHA256 for sessions ([register_crypto.go][crypto], [session.go][session]; `TestPasswordHashing` in [register_test.go][register-test]; `TestTokenValidation` in [session_test.go][session-test]). `gosec` in [ci.yml][ci] fails on MD5, SHA-1, DES and RC4. |

## V12 Secure Communication

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V12.1.1 | Only TLS 1.2 and 1.3, with the newest preferred | Pass (review) | Caddy's defaults are TLS 1.2 minimum and 1.3 preferred, and [Caddyfile.prod][caddy-prod] does not override them (no `tls` or `protocols` option). No test checks the live handshake. |
| V12.2.1 | TLS for every connection to external HTTP services, with no plain-text fallback | **Fail** | Browser to Caddy is HTTPS with HSTS; Google is called over HTTPS. But the mailer carries on without STARTTLS when the relay does not offer it, because `SMTP_REQUIRE_TLS` is off in production ([mailer.go][mailer], [config.go][config]). Today only Go's `smtp.PlainAuth`, which refuses to send the relay password over plain text, stops the send. [IO-271](https://linear.app/printf-scanf/issue/IO-271) |
| V12.2.2 | Public services use publicly trusted certificates | Pass (review) | Caddy gets Let's Encrypt certificates over ACME for the site address ([Caddyfile.prod][caddy-prod]). No test checks the issued chain. |

## V13 Configuration

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V13.4.1 | No `.git` or other source-control folders are deployed | Pass (review) | `.git` is in [`.dockerignore`][dockerignore] and [`backend/.dockerignore`][backend-dockerignore], and the runtime images copy only built binaries or the Next.js standalone output ([backend Dockerfile][backend-dockerfile], [web Dockerfile][web-dockerfile]). No test inspects the images. |

## V14 Data Protection

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V14.2.1 | Secrets are sent in the body or headers, never in the URL | Pass | Passwords, OTPs and tokens are request bodies or cookies in the contract ([auth.yaml][auth-yaml]); the only credential-like values in a URL are Google's one-time `code` and `state` on the callback, as OAuth requires, protected by PKCE and single use (`TestGoogleStateReplayedOrExpired` in [google_test.go][google-h-test]). Handler tests check responses against the contract ([contract.go][contract-helper]). |
| V14.3.1 | Signed-in data is cleared from the browser when the session ends | Pass | Log out and every sign-in clear the TanStack Query cache and the tab's session storage ([logout.ts][web-logout]; `clearClientData` in [logout.test.ts][web-logout-test]); account deletion already cleared the cache. Fixed in this change. |

## V15 Secure Coding and Architecture

| ID | Requirement (paraphrase) | Status | Evidence |
| --- | --- | --- | --- |
| V15.1.1 | Documentation sets remediation time frames for vulnerable components and for updates in general | Pass | [policies.md, Dependency remediation][policies-deps] (added in this change). |
| V15.2.1 | No component is past its documented time frame | Pass | `govulncheck` in [ci.yml][ci] blocks merging with a reachable Go vulnerability. On 28 Nov 2026 `pnpm audit --prod` reported no known vulnerabilities and the repo had no open Dependabot alerts. |
| V15.3.1 | Responses return only the fields the caller needs | Pass | Handlers map to contract types, never to database rows: the account has no password hash, admins see per-user counts only, exports are pseudonymised ([`TestGetAndUpdateOrganisation`][account-test]; `TestResearchExportHidesIdentityAndHonoursScope` in [export_integration_test.go][export-test]; contract checks in every handler test). |

V16 (Security Logging and Error Handling) and V17 (WebRTC) have no Level 1 requirements. The audit log is described under A09 in [`owasp-top-10.md`](owasp-top-10.md#a092025-security-logging-and-alerting-failures).

## Gaps

* **Three fails** (V3.3.1, V6.2.4, V12.2.1), each with an issue above.
* **Pass (review) without a test:** V12.1.1 (TLS versions), V12.2.2 (certificate issuer) and V13.4.1 (no `.git` in images). They are met by configuration but nothing in CI would notice a regression. The ZAP baseline scan ([`e2e/zap`](../../e2e/zap/scan.sh), job `zap` in [ci-e2e.yml](../../.github/workflows/ci-e2e.yml)) runs against the e2e stack, which uses the dev Caddyfile over plain http, so it does not cover them either.
* **npm has no CI gate** like `govulncheck`; it relies on Dependabot alerts and `pnpm audit`.
* **Level 2** is not attempted.

[report-tmpl]: ../../backend/templates/report/report.go
[report-tmpl-test]: ../../backend/templates/report/report_test.go
[reports-svc]: ../../backend/internal/service/reports/reports.go
[reports-h]: ../../backend/internal/http/handler/reports/reports.go
[reports-h-test]: ../../backend/internal/http/handler/reports/reports_test.go
[oidc]: ../../backend/internal/adapter/oidc/oidc.go
[oidc-test]: ../../backend/internal/adapter/oidc/oidc_test.go
[google-h]: ../../backend/internal/http/handler/auth/google.go
[google-h-test]: ../../backend/internal/http/handler/auth/google_test.go
[errors]: ../../backend/internal/http/middleware/errors.go
[base-test]: ../../backend/internal/http/middleware/base_test.go
[theme-script]: ../../web/src/lib/theme/theme-script.tsx
[layout-test]: ../../web/src/app/layout.test.tsx
[queries]: ../../backend/internal/dal/queries/
[seed-apply]: ../../backend/internal/seed/apply.go
[approle]: ../../backend/cmd/migrate/approle.go
[approle-test]: ../../backend/cmd/migrate/approle_test.go
[projects-test]: ../../backend/internal/service/projects/projects_internal_test.go
[csp]: ../../web/src/lib/security/csp.ts
[csp-test]: ../../web/src/lib/security/csp.test.ts
[openapi]: ../../contracts/openapi/openapi.yaml
[schemas]: ../../contracts/openapi/schemas/
[auth-yaml]: ../../contracts/openapi/paths/auth.yaml
[contract-helper]: ../../backend/internal/testutil/contract/contract.go
[register]: ../../backend/internal/service/auth/register.go
[register-test]: ../../backend/internal/service/auth/register_test.go
[register-h-test]: ../../backend/internal/http/handler/auth/register_integration_test.go
[answers]: ../../backend/internal/service/assessments/answers.go
[answers-test]: ../../backend/internal/service/assessments/answers_test.go
[answers-int]: ../../backend/internal/service/assessments/answers_integration_test.go
[submit-int]: ../../backend/internal/service/assessments/submit_integration_test.go
[login-h]: ../../backend/internal/http/handler/auth/login.go
[login-h-test]: ../../backend/internal/http/handler/auth/login_integration_test.go
[logout]: ../../backend/internal/http/handler/auth/logout.go
[reset]: ../../backend/internal/service/auth/reset.go
[reset-test]: ../../backend/internal/service/auth/reset_test.go
[login-test]: ../../backend/internal/service/auth/login_test.go
[crypto]: ../../backend/internal/service/auth/register_crypto.go
[account-svc]: ../../backend/internal/service/account/account.go
[account-test]: ../../backend/internal/http/handler/account/handler_integration_test.go
[caddy-prod]: ../../deploy/compose/Caddyfile.prod
[caddy-test]: ../../deploy/test/caddyfile_test.sh
[headers-spec]: ../../e2e/tests/meta/security-headers.spec.ts
[csp-guard]: ../../e2e/helpers/test.ts
[session]: ../../backend/internal/service/session/session.go
[session-test]: ../../backend/internal/service/session/session_test.go
[mw-session]: ../../backend/internal/http/middleware/session.go
[mw-session-test]: ../../backend/internal/http/middleware/session_test.go
[rbac]: ../../backend/internal/http/middleware/rbac.go
[csrf]: ../../backend/internal/http/middleware/csrf.go
[csrf-test]: ../../backend/internal/http/middleware/csrf_test.go
[ratelimit]: ../../backend/internal/http/middleware/ratelimit.go
[sectest]: ../../backend/internal/securitytest/security_test.go
[sectest-rl]: ../../backend/internal/securitytest/ratelimit_test.go
[sectest-cov]: ../../backend/internal/securitytest/coverage_test.go
[mailer]: ../../backend/internal/adapter/mailer/mailer.go
[config]: ../../backend/internal/config/config.go
[jobs-svc]: ../../backend/internal/service/jobs/jobs.go
[report-worker-test]: ../../backend/internal/worker/report/report_test.go
[password-input]: ../../web/src/components/ui/PasswordInput.tsx
[password-input-test]: ../../web/src/components/ui/password-input.test.tsx
[otp-input]: ../../web/src/features/auth/register/OtpInput.tsx
[web-logout]: ../../web/src/features/shell/logout.ts
[web-logout-test]: ../../web/src/features/shell/logout.test.ts
[admin-users]: ../../backend/internal/service/admin/users.go
[admin-users-test]: ../../backend/internal/http/handler/admin/users_integration_test.go
[export-test]: ../../backend/internal/worker/export/export_integration_test.go
[decisions-authz]: ../specs/architecture/cre-architecture-decisions.md#authorisation-and-deletion
[dev-admin]: ../runbooks/dev.md#local-admin-account
[policies-rl]: policies.md#anti-automation
[policies-deps]: policies.md#dependency-remediation
[ci]: ../../.github/workflows/ci.yml
[dockerignore]: ../../.dockerignore
[backend-dockerignore]: ../../backend/.dockerignore
[backend-dockerfile]: ../../backend/Dockerfile
[web-dockerfile]: ../../web/Dockerfile
