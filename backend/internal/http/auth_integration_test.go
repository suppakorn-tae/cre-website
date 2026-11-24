package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func startValkey(t *testing.T) *valkey.Client {
	t.Helper()
	ctx := context.Background()
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "valkey/valkey:8-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor:   wait.ForLog("Ready to accept connections").WithStartupTimeout(time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start valkey: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	ep, err := ctr.PortEndpoint(ctx, "6379/tcp", "redis")
	if err != nil {
		t.Fatal(err)
	}
	c, err := valkey.New(ep)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func connect(t *testing.T, url string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type authEnv struct {
	h        http.Handler
	sessions *session.Service
	userTok  string
	adminTok string
}

func newAuthEnv(t *testing.T) authEnv {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	url := testutil.NewEmptyDB(t)
	if err := testutil.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool := connect(t, url)
	cache := startValkey(t)

	const userID, adminID = "7d1c0a3e-5b0e-4b7a-9a43-0d2f4a1e9c11", "0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70"
	for _, a := range []struct{ id, email, role, pseud string }{
		{userID, "user@example.com", "user", "p-user"},
		{adminID, "admin@example.com", "admin", "p-admin"},
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO account (id, email, password_hash, pseudonym, role, terms_accepted_at, organisation)
			VALUES ($1, $2, 'x', $3, $4, now(), 'Siam Construction')`, a.id, a.email, a.pseud, a.role); err != nil {
			t.Fatal(err)
		}
	}

	d := app.Deps{Config: config.API{
		Env: "production", SessionSecret: strings.Repeat("s", 32),
		SessionTTL: time.Hour, RememberTTL: 24 * time.Hour,
		AllowedOrigins: []string{"https://app.example.com"}, RequestTimeout: 5 * time.Second,
	}, Logger: log.New(new(strings.Builder), "error")}
	if err := d.WireAuth(pool, cache); err != nil {
		t.Fatal(err)
	}
	userTok, _ := d.Sessions.Issue(userID, 1, false)
	adminTok, _ := d.Sessions.Issue(adminID, 1, true)
	return authEnv{
		h:        NewRouter(Deps{Deps: d, Metrics: metrics.New(), Health: health.New(time.Second)}),
		sessions: d.Sessions, userTok: userTok, adminTok: adminTok,
	}
}

func (e authEnv) do(method, path, token string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "https://app.example.com"+path, nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	if v := hdr[middleware.CSRFHeader]; v != "" {
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: v})
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	return w
}

func TestAuthMe(t *testing.T) {
	e := newAuthEnv(t)

	if w := e.do("GET", "/api/v1/auth/me", "", nil); w.Code != 401 {
		t.Fatalf("no session: %d %s", w.Code, w.Body)
	}
	w := e.do("GET", "/api/v1/auth/me", e.userTok, nil)
	if w.Code != 200 {
		t.Fatalf("session: %d %s", w.Code, w.Body)
	}
	var got api.AuthSession
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.User.Email != "user@example.com" || got.User.Role != "user" || !got.User.SignInMethods.Password ||
		got.User.SignInMethods.Google || got.User.Organisation == nil || got.KeepLoggedIn || got.ExpiresAt.IsZero() {
		t.Fatalf("body: %+v", got)
	}
	w = e.do("GET", "/api/v1/auth/me", e.adminTok, nil)
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || !got.KeepLoggedIn {
		t.Fatalf("remembered session: %v %s", err, w.Body)
	}
}

func TestSessionEndsWhenVersionIsBumped(t *testing.T) {
	e := newAuthEnv(t)
	if w := e.do("GET", "/api/v1/auth/me", e.userTok, nil); w.Code != 200 {
		t.Fatalf("before: %d", w.Code)
	}
	if _, err := e.sessions.BumpVersion(context.Background(), "7d1c0a3e-5b0e-4b7a-9a43-0d2f4a1e9c11"); err != nil {
		t.Fatal(err)
	}
	if w := e.do("GET", "/api/v1/auth/me", e.userTok, nil); w.Code != 401 {
		t.Fatalf("after bump: %d %s", w.Code, w.Body)
	}
}

func TestCSRF(t *testing.T) {
	e := newAuthEnv(t)

	w := e.do("GET", "/api/v1/auth/csrf", "", nil)
	var tok api.CsrfToken
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &tok) != nil || len(tok.CsrfToken) != 32 {
		t.Fatalf("csrf: %d %s", w.Code, w.Body)
	}
	var c *http.Cookie
	for _, k := range w.Result().Cookies() {
		if k.Name == middleware.CSRFCookie {
			c = k
		}
	}
	if c == nil || c.Value != tok.CsrfToken || c.HttpOnly || !c.Secure {
		t.Fatalf("cookie: %+v", c)
	}

	// Unsafe request without a token: 403. With the token: it reaches routing.
	if w := e.do("POST", "/api/v1/projects", e.userTok, nil); w.Code != 403 || !strings.Contains(w.Body.String(), "csrf_invalid") {
		t.Fatalf("no token: %d %s", w.Code, w.Body)
	}
	if w := e.do("POST", "/api/v1/projects", e.userTok, map[string]string{middleware.CSRFHeader: tok.CsrfToken}); w.Code == 403 {
		t.Fatalf("with token: %d %s", w.Code, w.Body)
	}
	// Origin is checked against ALLOWED_ORIGINS including the scheme.
	h := map[string]string{middleware.CSRFHeader: tok.CsrfToken, "Origin": "http://app.example.com"}
	if w := e.do("POST", "/api/v1/projects", e.userTok, h); w.Code != 403 {
		t.Fatalf("wrong scheme: %d", w.Code)
	}
}

func TestAdminRoutes(t *testing.T) {
	e := newAuthEnv(t)
	if w := e.do("GET", "/api/v1/admin/users", "", nil); w.Code != 401 {
		t.Fatalf("anonymous: %d", w.Code)
	}
	if w := e.do("GET", "/api/v1/admin/users", e.userTok, nil); w.Code != 403 || !strings.Contains(w.Body.String(), "forbidden") {
		t.Fatalf("user: %d %s", w.Code, w.Body)
	}
	// An admin passes the guard and reaches the users list.
	if w := e.do("GET", "/api/v1/admin/users", e.adminTok, nil); w.Code != 200 {
		t.Fatalf("admin: %d %s", w.Code, w.Body)
	}
}

func TestRateLimitHelperCountsAcrossReplicas(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	cache := startValkey(t)
	t.Setenv("RL_TEST_LIMIT", "2")
	t.Setenv("RL_TEST_WINDOW", "1m")
	var d1, d2 app.Deps
	url := testutil.NewEmptyDB(t)
	if err := testutil.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool := connect(t, url)
	cfg := config.API{Env: "production", SessionSecret: strings.Repeat("s", 32)}
	d1.Config, d2.Config = cfg, cfg
	for _, d := range []*app.Deps{&d1, &d2} {
		if err := d.WireAuth(pool, cache); err != nil {
			t.Fatal(err)
		}
	}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	key := func(*http.Request) string { return "k" }
	h1 := d1.RateLimit("RL_TEST", 10, time.Hour, key)(ok)
	h2 := d2.RateLimit("RL_TEST", 10, time.Hour, key)(ok)
	var codes []int
	for _, h := range []http.Handler{h1, h2, h1, h2} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("POST", "/x", nil))
		codes = append(codes, w.Code)
	}
	if codes[0] != 204 || codes[1] != 204 || codes[2] != 429 || codes[3] != 429 {
		t.Fatalf("env limit 2 shared by two replicas: %v", codes)
	}
}
