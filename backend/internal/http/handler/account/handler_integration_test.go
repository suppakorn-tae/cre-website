package account

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/account"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const (
	pwID     = "7d1c0a3e-5b0e-4b7a-9a43-0d2f4a1e9c11"
	googID   = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"
	otherID  = "0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70"
	password = "รหัสผ่านทดสอบ-2569"
)

type env struct {
	h     http.Handler
	d     app.Deps
	pool  *pgxpool.Pool
	cache *valkey.Client
	spec  *openapi3.T
}

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

func newEnv(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	url := testutil.NewEmptyDB(t)
	if err := testutil.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cache := startValkey(t)

	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO account (id, email, password_hash, google_sub, organisation, pseudonym, terms_accepted_at)
		  VALUES ($1, 'user@example.com', $2, 'sub-1', 'บริษัท ก', 'p-user', now())`, []any{pwID, hash}},
		{`INSERT INTO account (id, email, google_sub, pseudonym, terms_accepted_at)
		  VALUES ($1, 'goog@example.com', 'sub-2', 'p-goog', now())`, []any{googID}},
		{`INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		  VALUES ($1, 'other@example.com', $2, 'p-other', now())`, []any{otherID, hash}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}

	d := app.Deps{Config: config.API{
		Env: "production", SessionSecret: strings.Repeat("s", 32),
		SessionTTL: 12 * time.Hour, RememberTTL: 30 * 24 * time.Hour,
		AllowedOrigins: []string{"https://app.example.com"}, RequestTimeout: 5 * time.Second,
	}, Logger: log.New(new(strings.Builder), "error")}
	if err := d.WireAuth(pool, cache); err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Use(middleware.RealIP(nil))
	r.Route("/api/v1/account", func(r chi.Router) { Routes(r, d) })

	ldr := openapi3.NewLoader()
	ldr.IsExternalRefsAllowed = true
	spec, err := ldr.LoadFromFile("../../../../../contracts/openapi/dist/openapi.yaml")
	if err != nil {
		t.Logf("contract check off: %v", err)
		spec = nil
	}
	return env{h: r, d: d, pool: pool, cache: cache, spec: spec}
}

func (e env) token(id string) string {
	tok, _ := e.d.Sessions.Issue(id, 1, false)
	return tok
}

func (e env) do(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	rd := bytes.NewReader(nil)
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, "https://app.example.com/api/v1/account"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if e.spec != nil {
		if err := contract.Validate(e.spec, req, w.Result()); err != nil {
			t.Errorf("%s %s -> %d does not match the contract: %v", method, path, w.Code, err)
		}
	}
	return w
}

func cookie(w *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == session.CookieName {
			return c
		}
	}
	return nil
}

func TestGetAndUpdateOrganisation(t *testing.T) {
	e := newEnv(t)
	tok := e.token(pwID)

	if w := e.do(t, "GET", "", "", nil); w.Code != 401 {
		t.Errorf("no session: %d", w.Code)
	}
	w := e.do(t, "GET", "", tok, nil)
	var a api.Account
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &a) != nil || a.Email != "user@example.com" ||
		!a.SignInMethods.Password || !a.SignInMethods.Google || a.Organisation == nil || *a.Organisation != "บริษัท ก" {
		t.Fatalf("get: %d %s", w.Code, w.Body)
	}
	if w := e.do(t, "GET", "", e.token(googID), nil); !strings.Contains(w.Body.String(), `"password":false`) {
		t.Errorf("google-only account: %s", w.Body)
	}

	w = e.do(t, "PATCH", "", tok, map[string]any{"organisation": "  กรมทางหลวง "})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"organisation":"กรมทางหลวง"`) {
		t.Errorf("update: %d %s", w.Code, w.Body)
	}
	w = e.do(t, "PATCH", "", tok, map[string]any{"organisation": nil})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"organisation":null`) {
		t.Errorf("clear: %d %s", w.Code, w.Body)
	}
	w = e.do(t, "PATCH", "", tok, map[string]any{"organisation": strings.Repeat("ก", 201)})
	if w.Code != 422 || !strings.Contains(w.Body.String(), "too_long") {
		t.Errorf("too long: %d %s", w.Code, w.Body)
	}
	if w := e.do(t, "PATCH", "", tok, map[string]any{"organisation": strings.Repeat("ก", 200)}); w.Code != 200 {
		t.Errorf("200 chars: %d %s", w.Code, w.Body)
	}
	// The other account is untouched.
	var org *string
	_ = e.pool.QueryRow(context.Background(), `SELECT organisation FROM account WHERE id = $1`, otherID).Scan(&org)
	if org != nil {
		t.Errorf("other account organisation = %q", *org)
	}
}

func TestChangePassword(t *testing.T) {
	e := newEnv(t)
	tok := e.token(pwID)
	other := e.token(otherID)
	body := func(cur, next, conf string) map[string]string {
		return map[string]string{"current_password": cur, "new_password": next, "new_password_confirmation": conf}
	}

	for _, c := range []struct {
		name, code string
		b          map[string]string
	}{
		{"wrong current", "current_password_incorrect", body("wrong-password", "newpassword-1", "newpassword-1")},
		{"too short", "password_too_short", body(password, "short", "short")},
		{"mismatch", "password_mismatch", body(password, "newpassword-1", "newpassword-2")},
	} {
		if w := e.do(t, "PUT", "/password", tok, c.b); w.Code != 422 || !strings.Contains(w.Body.String(), c.code) {
			t.Errorf("%s: %d %s", c.name, w.Code, w.Body)
		}
	}
	if w := e.do(t, "PUT", "/password", e.token(googID), body("x", "newpassword-1", "newpassword-1")); w.Code != 409 ||
		!strings.Contains(w.Body.String(), "no_password") {
		t.Errorf("no password: %d %s", w.Code, w.Body)
	}

	w := e.do(t, "PUT", "/password", tok, body(password, "newpassword-1", "newpassword-1"))
	if w.Code != 204 {
		t.Fatalf("change: %d %s", w.Code, w.Body)
	}
	// Old token ended; the fresh cookie works; the new password verifies.
	if w := e.do(t, "GET", "", tok, nil); w.Code != 401 {
		t.Errorf("old token after change: %d", w.Code)
	}
	c := cookie(w)
	if c == nil {
		t.Fatal("no fresh cookie")
	}
	if w := e.do(t, "GET", "", c.Value, nil); w.Code != 200 {
		t.Errorf("fresh cookie: %d", w.Code)
	}
	if w := e.do(t, "GET", "", other, nil); w.Code != 200 {
		t.Errorf("other account session: %d", w.Code)
	}
	var hash string
	_ = e.pool.QueryRow(context.Background(), `SELECT password_hash FROM account WHERE id = $1`, pwID).Scan(&hash)
	if !auth.VerifyPassword("newpassword-1", hash) || auth.VerifyPassword(password, hash) {
		t.Error("stored hash does not match the new password")
	}
}

func TestDeleteWithPassword(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	tok := e.token(pwID)
	proj := testutil.NewProject(t, e.pool, pwID)

	if w := e.do(t, "DELETE", "", tok, map[string]string{}); w.Code != 422 || !strings.Contains(w.Body.String(), "current_password_incorrect") {
		t.Errorf("no password: %d %s", w.Code, w.Body)
	}
	if w := e.do(t, "DELETE", "", tok, map[string]string{"current_password": "nope-nope"}); w.Code != 422 {
		t.Errorf("wrong password: %d %s", w.Code, w.Body)
	}
	w := e.do(t, "DELETE", "", tok, map[string]string{"current_password": password})
	if w.Code != 204 {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	if c := cookie(w); c == nil || c.MaxAge >= 0 {
		t.Errorf("cookie = %+v, want cleared", c)
	}
	if w := e.do(t, "GET", "", tok, nil); w.Code != 401 {
		t.Errorf("token after delete: %d", w.Code)
	}

	var email, hash, sub, org, pseud *string
	var status string
	var deletedAt *time.Time
	if err := e.pool.QueryRow(ctx, `SELECT email::text, password_hash, google_sub, organisation, pseudonym, status::text, deleted_at
		FROM account WHERE id = $1`, pwID).Scan(&email, &hash, &sub, &org, &pseud, &status, &deletedAt); err != nil {
		t.Fatal(err)
	}
	if email != nil || hash != nil || sub != nil || status != "deleted" || deletedAt == nil ||
		org == nil || *org != "บริษัท ก" || pseud == nil || *pseud != "p-user" {
		t.Errorf("row = %v %v %v %v %v %s %v", email, hash, sub, org, pseud, status, deletedAt)
	}
	var owner string
	var delProj *time.Time
	if err := e.pool.QueryRow(ctx, `SELECT owner_id::text, deleted_at FROM project WHERE id = $1`, proj.ID).Scan(&owner, &delProj); err != nil ||
		owner != pwID || delProj != nil {
		t.Errorf("project not kept: %v %v %v", owner, delProj, err)
	}
	// The e-mail can register again as a new account.
	if _, err := e.pool.Exec(ctx, `INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		VALUES (gen_random_uuid(), 'user@example.com', 'h', 'p-new', now())`); err != nil {
		t.Errorf("register again: %v", err)
	}
}

func TestDeleteWithGoogleReauth(t *testing.T) {
	e := newEnv(t)
	tok := e.token(googID)

	if w := e.do(t, "DELETE", "", tok, nil); w.Code != 403 || !strings.Contains(w.Body.String(), "reauth_required") {
		t.Fatalf("no reauth: %d %s", w.Code, w.Body)
	}
	if err := e.cache.Set(context.Background(), svc.ReauthKey(googID), []byte("1"), svc.ReauthTTL); err != nil {
		t.Fatal(err)
	}
	if w := e.do(t, "DELETE", "", tok, map[string]string{}); w.Code != 204 {
		t.Fatalf("with reauth: %d %s", w.Code, w.Body)
	}
	if _, err := e.cache.Get(context.Background(), svc.ReauthKey(googID)); err == nil {
		t.Error("reauth flag not consumed")
	}
	var status string
	_ = e.pool.QueryRow(context.Background(), `SELECT status::text FROM account WHERE id = $1`, googID).Scan(&status)
	if status != "deleted" {
		t.Errorf("status = %s", status)
	}
}
