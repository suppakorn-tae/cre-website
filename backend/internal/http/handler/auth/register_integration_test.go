package auth_test

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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	apihttp "github.com/suppakorn-tae/cre-website/backend/internal/http"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const (
	base   = "https://app.example.com"
	csrf   = "0123456789abcdef0123456789abcdef"
	signup = "/api/v1/auth/register/"
)

type env struct {
	h    http.Handler
	db   *pgxpool.Pool
	mail *mailer.Fake
	sess *session.Service
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
	url := testutil.NewEmptyDB(t)
	if err := testutil.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cache := startValkey(t)

	fake := &mailer.Fake{}
	d := app.Deps{
		Config: config.API{
			Env: "production", SessionSecret: strings.Repeat("s", 32),
			SessionTTL: time.Hour, RememberTTL: 24 * time.Hour,
			AllowedOrigins: []string{base}, RequestTimeout: 5 * time.Second,
		},
		Logger: log.New(new(strings.Builder), "error"),
		Mailer: fake,
	}
	if err := d.WireAuth(pool, cache); err != nil {
		t.Fatal(err)
	}
	return env{
		h:  apihttp.NewRouter(apihttp.Deps{Deps: d, Metrics: metrics.New(), Health: health.New(time.Second)}),
		db: pool, mail: fake, sess: d.Sessions,
	}
}

type result struct {
	*httptest.ResponseRecorder
}

// post sends a JSON body and checks the response against the OpenAPI spec.
func (e env) post(t *testing.T, path string, body any) result {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, base+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(middleware.CSRFHeader, csrf)
	req.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: csrf}) //nolint:gosec // G124: test request cookie, never sent to a browser
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)

	spec, err := api.GetSpec()
	if err != nil {
		t.Fatal(err)
	}
	creq := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	if err := contract.Validate(spec, creq, w.Result()); err != nil {
		t.Errorf("POST %s -> %d does not match the contract: %v\n%s", path, w.Code, err, w.Body)
	}
	return result{w}
}

func (e env) accounts(t *testing.T) int {
	t.Helper()
	var n int
	if err := e.db.QueryRow(context.Background(), `SELECT count(*) FROM account`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

var codeRe = regexp.MustCompile(`\b\d{6}\b`)

func (e env) code(t *testing.T) string {
	t.Helper()
	s := e.mail.Sent()
	if len(s) == 0 {
		t.Fatal("no e-mail")
	}
	return codeRe.FindString(s[len(s)-1].Body)
}

func form(email string) map[string]any {
	return map[string]any{ //nolint:gosec // G101: test fixture, not a real credential
		"email": email, "password": "รหัสผ่านทดสอบ-2569", "password_confirmation": "รหัสผ่านทดสอบ-2569",
		"organisation": "บริษัท สยามก่อสร้าง จำกัด", "retention_accepted": true, "terms_accepted": true,
	}
}

func errCode(t *testing.T, w result) (string, []api.FieldError) {
	t.Helper()
	var b struct {
		Error struct {
			Code   string           `json:"code"`
			Fields []api.FieldError `json:"fields"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
		t.Fatal(err)
	}
	return b.Error.Code, b.Error.Fields
}

func TestSignUpFlow(t *testing.T) {
	e := newEnv(t)
	const mail1 = "somchai.k@example.co.th"

	w := e.post(t, signup+"start", form(mail1))
	var ch api.OtpChallenge
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &ch) != nil || ch.ExpiresInSeconds != 600 || ch.ResendAvailableInSeconds != 60 {
		t.Fatalf("start: %d %s", w.Code, w.Body)
	}
	if e.accounts(t) != 0 {
		t.Fatal("account row exists before OTP verification")
	}
	if len(e.mail.Sent()) != 1 {
		t.Fatalf("sent: %d", len(e.mail.Sent()))
	}
	code := e.code(t)

	// Resend inside the cool-down.
	w = e.post(t, signup+"resend", map[string]any{"email": mail1})
	if c, _ := errCode(t, w); w.Code != 429 || c != "otp_resend_cooldown" || w.Header().Get("Retry-After") == "" {
		t.Fatalf("resend: %d %s", w.Code, w.Body)
	}

	// Wrong code: 422 on /otp.
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	w = e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": wrong})
	if c, f := errCode(t, w); w.Code != 422 || c != "otp_invalid" || len(f) != 1 || f[0].Field != "/otp" {
		t.Fatalf("wrong: %d %s", w.Code, w.Body)
	}
	if e.accounts(t) != 0 {
		t.Fatal("account created by a wrong code")
	}

	w = e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": code})
	var got api.AuthSession
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &got) != nil {
		t.Fatalf("verify: %d %s", w.Code, w.Body)
	}
	if got.User.Email != mail1 || got.User.Role != "user" || !got.User.SignInMethods.Password || got.User.Organisation == nil || got.KeepLoggedIn {
		t.Fatalf("session body: %+v", got)
	}
	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == session.CookieName {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly || !cookie.Secure || cookie.MaxAge != 0 {
		t.Fatalf("cookie: %+v", cookie)
	}
	if _, err := e.sess.Authenticate(context.Background(), cookie.Value); err != nil {
		t.Fatalf("session cookie is not valid: %v", err)
	}
	var hash, pseud, status string
	if err := e.db.QueryRow(context.Background(),
		`SELECT password_hash, pseudonym, status::text FROM account WHERE email = $1`, mail1).Scan(&hash, &pseud, &status); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") || !strings.HasPrefix(pseud, "p-") || status != "active" {
		t.Fatalf("row: %q %q %q", hash, pseud, status)
	}

	// The e-mail is taken now, in any case.
	w = e.post(t, signup+"start", form("Somchai.K@Example.co.th"))
	if c, _ := errCode(t, w); w.Code != 409 || c != "email_taken" {
		t.Fatalf("start again: %d %s", w.Code, w.Body)
	}
	// The pending sign-up is gone.
	w = e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": code})
	if c, _ := errCode(t, w); w.Code != 404 || c != "no_pending_signup" {
		t.Fatalf("verify again: %d %s", w.Code, w.Body)
	}
}

func TestSixthWrongCodeInvalidatesSignUp(t *testing.T) {
	e := newEnv(t)
	const mail1 = "lock@example.co.th"
	if w := e.post(t, signup+"start", form(mail1)); w.Code != 200 {
		t.Fatalf("start: %d %s", w.Code, w.Body)
	}
	code := e.code(t)
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	for i := 1; i <= 5; i++ {
		w := e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": wrong})
		if c, _ := errCode(t, w); w.Code != 422 || c != "otp_invalid" {
			t.Fatalf("attempt %d: %d %s", i, w.Code, w.Body)
		}
	}
	w := e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": wrong})
	if c, _ := errCode(t, w); w.Code != 422 || c != "otp_locked" {
		t.Fatalf("sixth: %d %s", w.Code, w.Body)
	}
	w = e.post(t, signup+"verify", map[string]any{"email": mail1, "otp": code})
	if w.Code != 404 {
		t.Fatalf("right code after lock: %d %s", w.Code, w.Body)
	}
	if e.accounts(t) != 0 {
		t.Fatal("account created")
	}
}

func TestStartValidation(t *testing.T) {
	e := newEnv(t)
	f := form("v@example.co.th")
	f["password_confirmation"] = "something-else-1"
	f["terms_accepted"] = false
	f["retention_accepted"] = false
	w := e.post(t, signup+"start", f)
	_, fields := errCode(t, w)
	got := map[string]string{}
	for _, x := range fields {
		got[x.Field] = x.Code
	}
	if w.Code != 422 || got["/password_confirmation"] != "password_mismatch" ||
		got["/terms_accepted"] != "terms_not_accepted" || got["/retention_accepted"] != "retention_not_accepted" {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
	if len(e.mail.Sent()) != 0 {
		t.Fatal("e-mail sent")
	}
}

func TestResendNeedsPendingSignUp(t *testing.T) {
	e := newEnv(t)
	w := e.post(t, signup+"resend", map[string]any{"email": "nobody@example.co.th"})
	if c, _ := errCode(t, w); w.Code != 404 || c != "no_pending_signup" {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}
