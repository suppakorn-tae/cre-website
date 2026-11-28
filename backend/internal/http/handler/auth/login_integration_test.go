package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

func loginStartValkey(t *testing.T) *valkey.Client {
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

type loginEnv struct {
	h    http.Handler
	d    app.Deps
	mail *mailer.Fake
	spec *openapi3.T
}

const (
	loginUserID  = "7d1c0a3e-5b0e-4b7a-9a43-0d2f4a1e9c11"
	loginOffID   = "0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70"
	loginGoogID  = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"
	loginUserPwd = "รหัสผ่านทดสอบ-2569" //nolint:gosec // G101: test fixture, not a real credential
)

func newLoginEnv(t *testing.T) (loginEnv, string) {
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
	cache := loginStartValkey(t)

	hash, err := svc.HashPassword(loginUserPwd)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range []struct{ id, email, status, pseud string }{
		{loginUserID, "user@example.com", "active", "p-user"},
		{loginOffID, "off@example.com", "deactivated", "p-off"},
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO account (id, email, password_hash, pseudonym, status, terms_accepted_at)
			VALUES ($1, $2, $3, $4, $5::account_status, now())`, a.id, a.email, hash, a.pseud, a.status); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO account (id, email, google_sub, pseudonym, terms_accepted_at)
		VALUES ($1, 'goog@example.com', 'sub-1', 'p-goog', now())`, loginGoogID); err != nil {
		t.Fatal(err)
	}

	d := app.Deps{Config: config.API{
		Env: "production", SessionSecret: strings.Repeat("s", 32),
		SessionTTL: 12 * time.Hour, RememberTTL: 30 * 24 * time.Hour,
		AllowedOrigins: []string{"https://app.example.com"}, RequestTimeout: 5 * time.Second,
	}, Logger: log.New(new(strings.Builder), "error")}
	if err := d.WireAuth(pool, cache); err != nil {
		t.Fatal(err)
	}
	fake := &mailer.Fake{}
	r := chi.NewRouter()
	r.Use(middleware.RealIP(nil))
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Get("/csrf", csrfToken(true))
		r.With(d.Auth).Get("/me", me(d.Sessions))
		loginRoutes(r, d, fake)
	})
	ldr := openapi3.NewLoader()
	ldr.IsExternalRefsAllowed = true
	spec, err := ldr.LoadFromFile("../../../../../contracts/openapi/dist/openapi.yaml")
	if err != nil {
		// The bundle is built by `make gen`; without it only the contract
		// check is skipped, the behaviour checks still run.
		t.Logf("contract check off: %v", err)
		spec = nil
	}
	return loginEnv{h: r, d: d, mail: fake, spec: spec}, "https://app.example.com"
}

func (e loginEnv) do(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, "https://app.example.com/api/v1/auth"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	// Every response must match the contract.
	if e.spec == nil {
		return w
	}
	if err := contract.Validate(e.spec, req, w.Result()); err != nil {
		t.Errorf("%s %s -> %d does not match the contract: %v", method, path, w.Code, err)
	}
	return w
}

func cookieNamed(w *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestLoginLogout(t *testing.T) {
	e, _ := newLoginEnv(t)

	w := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "User@Example.com", Password: loginUserPwd})
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body)
	}
	c := cookieNamed(w, session.CookieName)
	if c == nil || !c.HttpOnly || !c.Secure || c.MaxAge != 0 {
		t.Fatalf("cookie = %+v, want httpOnly Secure session cookie", c)
	}
	var got api.AuthSession
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.KeepLoggedIn || got.User.Email != "user@example.com" {
		t.Fatalf("body = %s (%v)", w.Body, err)
	}

	// /csrf matches the contract too.
	if cw := e.do(t, "GET", "/csrf", "", nil); cw.Code != 200 || cookieNamed(cw, middleware.CSRFCookie) == nil {
		t.Fatalf("csrf: %d %s", cw.Code, cw.Body)
	}

	// The cookie works on /me.
	if w := e.do(t, "GET", "/me", c.Value, nil); w.Code != 200 {
		t.Fatalf("me: %d %s", w.Code, w.Body)
	}

	// keep_logged_in persists the cookie for the remember lifetime.
	keep := true
	w = e.do(t, "POST", "/login", "", api.LoginRequest{Email: "user@example.com", Password: loginUserPwd, KeepLoggedIn: &keep})
	rc := cookieNamed(w, session.CookieName)
	if w.Code != 200 || rc == nil || rc.MaxAge < 29*24*3600 {
		t.Fatalf("remember: %d cookie=%+v", w.Code, rc)
	}

	// Log out clears the cookie; the other device's token still works.
	lw := e.do(t, "POST", "/logout", c.Value, nil)
	if lw.Code != 204 {
		t.Fatalf("logout: %d %s", lw.Code, lw.Body)
	}
	if cc := cookieNamed(lw, session.CookieName); cc == nil || cc.MaxAge >= 0 {
		t.Errorf("logout cookie = %+v, want cleared", cc)
	}
	if w := e.do(t, "GET", "/me", rc.Value, nil); w.Code != 200 {
		t.Errorf("other device after logout: %d", w.Code)
	}
	// An expired, invalid or missing session still gets its cookie cleared.
	for _, tok := range []string{"", "not-a-session-token", c.Value + "x"} {
		w := e.do(t, "POST", "/logout", tok, nil)
		cc := cookieNamed(w, session.CookieName)
		if w.Code != 204 || cc == nil || cc.MaxAge >= 0 {
			t.Errorf("logout with token %q: %d cookie=%+v, want 204 and cleared", tok, w.Code, cc)
		}
	}
}

func TestLoginFailures(t *testing.T) {
	e, _ := newLoginEnv(t)
	wrong := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "user@example.com", Password: "wrong-password"})
	unknown := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "nobody@example.com", Password: "wrong-password"})
	google := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "goog@example.com", Password: "whatever-123"})
	norm := func(b string) string { return regexp.MustCompile(`"request_id":"[^"]*",?`).ReplaceAllString(b, "") }
	if wrong.Code != 401 || unknown.Code != 401 || google.Code != 401 {
		t.Fatalf("codes = %d %d %d, want 401", wrong.Code, unknown.Code, google.Code)
	}
	if norm(wrong.Body.String()) != norm(unknown.Body.String()) || norm(wrong.Body.String()) != norm(google.Body.String()) {
		t.Errorf("bodies differ: %s | %s | %s", wrong.Body, unknown.Body, google.Body)
	}
	if cookieNamed(wrong, session.CookieName) != nil {
		t.Error("failed login set a cookie")
	}
	if w := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "off@example.com", Password: loginUserPwd}); w.Code != 403 ||
		!strings.Contains(w.Body.String(), "account_unavailable") {
		t.Errorf("deactivated: %d %s", w.Code, w.Body)
	}
	if w := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "not-an-email", Password: ""}); w.Code != 422 {
		t.Errorf("invalid input: %d %s", w.Code, w.Body)
	}
}

var loginOTP = regexp.MustCompile(`[0-9]{6}`)

func TestPasswordResetEndsOtherSessions(t *testing.T) {
	e, _ := newLoginEnv(t)

	login := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "user@example.com", Password: loginUserPwd})
	old := cookieNamed(login, session.CookieName).Value
	if w := e.do(t, "GET", "/me", old, nil); w.Code != 200 {
		t.Fatalf("me before reset: %d", w.Code)
	}

	// Same response for a registered and an unregistered e-mail.
	a := e.do(t, "POST", "/password/forgot", "", api.EmailRequest{Email: "user@example.com"})
	b := e.do(t, "POST", "/password/forgot", "", api.EmailRequest{Email: "nobody@example.com"})
	if a.Code != 200 || a.Body.String() != b.Body.String() {
		t.Fatalf("forgot: %d %s vs %d %s", a.Code, a.Body, b.Code, b.Body)
	}
	if w := e.do(t, "POST", "/password/forgot", "", api.EmailRequest{Email: "user@example.com"}); w.Code != 429 ||
		w.Header().Get("Retry-After") == "" {
		t.Errorf("resend inside 60 s: %d %s", w.Code, w.Body)
	}
	var code string
	for range 50 { // the e-mail is sent in the background
		if s := e.mail.Sent(); len(s) > 0 {
			code = loginOTP.FindString(s[0].Subject + s[0].Body)
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if code == "" {
		t.Fatal("no OTP e-mail")
	}

	req := api.ResetPasswordRequest{Email: "user@example.com", Otp: api.OtpCode(code), NewPassword: "brand-new-pass", NewPasswordConfirmation: "brand-new-pass"}
	bad := req
	bad.Otp = "000000"
	if bad.Otp == req.Otp {
		bad.Otp = "111111"
	}
	if w := e.do(t, "POST", "/password/reset", "", bad); w.Code != 422 || !strings.Contains(w.Body.String(), "otp_invalid") {
		t.Errorf("wrong otp: %d %s", w.Code, w.Body)
	}
	if w := e.do(t, "POST", "/password/reset", "", req); w.Code != 204 || len(w.Result().Cookies()) != 0 {
		t.Fatalf("reset: %d %s", w.Code, w.Body)
	}

	// The old session on another device now gets 401; new password works.
	if w := e.do(t, "GET", "/me", old, nil); w.Code != 401 {
		t.Errorf("old session after reset: %d, want 401", w.Code)
	}
	if w := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "user@example.com", Password: loginUserPwd}); w.Code != 401 {
		t.Errorf("old password: %d, want 401", w.Code)
	}
	if w := e.do(t, "POST", "/login", "", api.LoginRequest{Email: "user@example.com", Password: "brand-new-pass"}); w.Code != 200 {
		t.Errorf("new password: %d %s", w.Code, w.Body)
	}
}
