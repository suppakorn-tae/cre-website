package securitytest

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

// limited is a public route with a per-IP and a per-e-mail limiter. The
// limits are the production defaults (no RL_* variables set in tests).
type limited struct {
	key       string
	path      string
	ip, email int
}

var limitedRoutes = []limited{
	{"POST /auth/login", "/auth/login", 20, 10},
	{"POST /auth/register/start", "/auth/register/start", 10, 5},
	{"POST /auth/register/verify", "/auth/register/verify", 30, 20},
	{"POST /auth/register/resend", "/auth/register/resend", 10, 5},
	{"POST /auth/password/forgot", "/auth/password/forgot", 10, 5},
	{"POST /auth/password/reset", "/auth/password/reset", 20, 10},
}

// accountLimited is a signed-in route limited per account.
type accountLimited struct {
	key, method, path, body string
	limit                   int
}

var accountLimitedRoutes = []accountLimited{
	{"DELETE /account", "DELETE", "/account", `{"password":"wrong-password"}`, 5},
	{"PUT /account/password", "PUT", "/account/password", `{"current_password":"wrong","new_password":"another-password-1"}`, 10},
}

// A limiter lets `limit` requests through and answers 429 rate_limited with
// Retry-After on the next one. The request count is the only thing varied:
// the guarded handler is never reached for the 429.
func expectBlockedAfter(t *testing.T, limit int, send func(i int) *httptest.ResponseRecorder) {
	t.Helper()
	for i := 1; i <= limit; i++ {
		if w := send(i); w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d of %d was already limited: %s", i, limit, w.Body)
		}
	}
	w := send(limit + 1)
	if w.Code != http.StatusTooManyRequests || !strings.Contains(w.Body.String(), middleware.RateLimitedCode) {
		t.Fatalf("request %d: status %d, want 429 rate_limited: %s", limit+1, w.Code, w.Body)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("429 without Retry-After")
	}
}

func TestRateLimitsOnPublicAuthRoutes(t *testing.T) {
	e := newEnv(t)
	for n, c := range limitedRoutes {
		method, _, _ := strings.Cut(c.key, " ")
		post := func(email, addr string) *httptest.ResponseRecorder {
			return e.do(req{
				method: method, path: c.path, csrf: true, addr: addr,
				body: fmt.Sprintf(`{"email":%q,"password":"x","otp":"000000","code":"000000","new_password":"x"}`, email),
			})
		}
		// Per IP: one address, a new e-mail every time, so only the IP limiter counts.
		t.Run(c.key+" per ip", func(t *testing.T) {
			addr := fmt.Sprintf("203.0.113.%d", n+1)
			expectBlockedAfter(t, c.ip, func(i int) *httptest.ResponseRecorder {
				return post(fmt.Sprintf("ip%d-%d@example.com", n, i), addr)
			})
		})
		// Per e-mail: one e-mail, a new address every time, so only the e-mail limiter counts.
		t.Run(c.key+" per email", func(t *testing.T) {
			expectBlockedAfter(t, c.email, func(i int) *httptest.ResponseRecorder {
				return post(fmt.Sprintf("victim%d@example.com", n), fmt.Sprintf("192.0.2.%d", i))
			})
		})
		// The e-mail key is case and space insensitive, so it cannot be dodged.
		t.Run(c.key+" email key is normalised", func(t *testing.T) {
			expectBlockedAfter(t, c.email, func(i int) *httptest.ResponseRecorder {
				email := fmt.Sprintf("  Mixed%d@Example.COM ", n)
				if i%2 == 0 {
					email = strings.ToLower(strings.TrimSpace(email))
				}
				return post(email, fmt.Sprintf("192.0.3.%d", i))
			})
		})
	}
}

func TestRateLimitsPerAccount(t *testing.T) {
	e := newEnv(t)
	for _, c := range accountLimitedRoutes {
		t.Run(c.key, func(t *testing.T) {
			a := testutil.NewAccount(t, e.db)
			tok, _ := e.sess.Issue(a.ID, 1, false)
			me := &who{Account: a, token: tok}
			expectBlockedAfter(t, c.limit, func(int) *httptest.ResponseRecorder {
				return e.do(req{method: c.method, path: c.path, as: me, csrf: true, body: c.body})
			})
			// The counter is per account: another account is not locked out,
			// even from the same address.
			other := testutil.NewAccount(t, e.db)
			otherTok, _ := e.sess.Issue(other.ID, 1, false)
			w := e.do(req{method: c.method, path: c.path, as: &who{Account: other, token: otherTok}, csrf: true, body: c.body})
			if w.Code == http.StatusTooManyRequests {
				t.Fatalf("another account is limited too: %s", w.Body)
			}
		})
	}
}

// Every contract operation that declares a 429 is either covered by a limit
// test above or still pending, so a new limited route cannot skip this file.
func TestEveryDeclaredRateLimitIsTested(t *testing.T) {
	e := newEnv(t)
	tested := map[string]bool{}
	for _, c := range limitedRoutes {
		tested[c.key] = true
	}
	for _, c := range accountLimitedRoutes {
		tested[c.key] = true
	}
	tested["POST /auth/google/start"] = true               // TestRateLimitOnGoogleRoutes
	tested["POST /auth/google/complete"] = true            // TestRateLimitOnGoogleRoutes
	tested["POST /projects/{}/versions/{}/reports"] = true // TestRateLimitOnReportRequests
	pend := map[string]bool{}
	for _, p := range pending {
		pend[p] = true
	}
	for path, item := range e.spec.Paths.Map() {
		for method, op := range item.Operations() {
			key := method + " " + norm(path)
			if op.Responses.Status(http.StatusTooManyRequests) == nil || tested[key] || pend[key] {
				continue
			}
			t.Errorf("%s declares 429 but has no rate-limit test: add it to limitedRoutes or accountLimitedRoutes", key)
		}
	}
	for k := range tested {
		if !isCovered(k) {
			t.Errorf("%s has a rate-limit test but is not in covered", k)
		}
	}
}

// Report requests are limited per account (RL_REPORT_REQUEST, 10 per 10 min).
func TestRateLimitOnReportRequests(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	path := "/projects/" + f.project.ID + "/versions/" + f.version.ID + "/reports"
	expectBlockedAfter(t, 10, func(int) *httptest.ResponseRecorder {
		return e.do(req{method: "POST", path: path, as: &e.alice, csrf: true})
	})
	// Another account has its own counter.
	if w := e.do(req{method: "POST", path: path, as: &e.bob, csrf: true}); w.Code == http.StatusTooManyRequests {
		t.Fatalf("limit leaked to another account: %s", w.Body)
	}
}

// Google start and complete are limited per IP only (RL_GOOGLE_IP, 30 per
// 15 min); the handler behind the limit answers 503 here (no Google config).
func TestRateLimitOnGoogleRoutes(t *testing.T) {
	e := newEnv(t)
	for n, p := range []string{"/auth/google/start", "/auth/google/complete"} {
		t.Run("POST "+p, func(t *testing.T) {
			addr := fmt.Sprintf("198.51.100.%d", n+1)
			expectBlockedAfter(t, 30, func(int) *httptest.ResponseRecorder {
				return e.do(req{method: "POST", path: p, csrf: true, addr: addr, body: `{"intent":"login"}`})
			})
		})
	}
}
