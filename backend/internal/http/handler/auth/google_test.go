package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc/oidctest"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/account"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const webBase = "https://app.example.com"

// gMem is a StateStore without expiry.
type gMem struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *gMem) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *gMem) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.m[k]; ok {
		return v, nil
	}
	return nil, valkey.ErrNotFound
}

func (c *gMem) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}
func (c *gMem) Incr(context.Context, string, time.Duration) (int64, error) { return 1, nil }
func (c *gMem) SetNX(_ context.Context, k string, v []byte, _ time.Duration) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.m[k]; ok {
		return false, nil
	}
	c.m[k] = v
	return true, nil
}

type gRow struct {
	id, email, sub string
	password       bool
}

// gAccounts is both the GoogleStore and the session Store.
type gAccounts struct {
	mu   sync.Mutex
	rows []*gRow
}

func (s *gAccounts) find(f func(*gRow) bool) *gRow {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.rows {
		if f(r) {
			return r
		}
	}
	return nil
}

func (s *gAccounts) acc(r *gRow) (svc.GoogleAccount, error) {
	if r == nil {
		return svc.GoogleAccount{}, svc.ErrLoginNoAccount
	}
	return svc.GoogleAccount{ID: r.id, Status: "active", Version: 1, HasPassword: r.password, HasGoogle: r.sub != ""}, nil
}

func (s *gAccounts) BySub(_ context.Context, sub string) (svc.GoogleAccount, error) {
	return s.acc(s.find(func(r *gRow) bool { return r.sub == sub }))
}

func (s *gAccounts) ByEmail(_ context.Context, e string) (svc.GoogleAccount, error) {
	return s.acc(s.find(func(r *gRow) bool { return r.email == e }))
}

func (s *gAccounts) ByID(_ context.Context, id string) (svc.GoogleAccount, error) {
	return s.acc(s.find(func(r *gRow) bool { return r.id == id }))
}

func (s *gAccounts) LinkSub(_ context.Context, id, sub string) (bool, error) {
	r := s.find(func(r *gRow) bool { return r.id == id })
	if r == nil || r.sub != "" {
		return false, nil
	}
	r.sub = sub
	return true, nil
}

func (s *gAccounts) UnlinkSub(_ context.Context, id string) (bool, error) {
	r := s.find(func(r *gRow) bool { return r.id == id })
	if r == nil || r.sub == "" || !r.password {
		return false, nil
	}
	r.sub = ""
	return true, nil
}

func (s *gAccounts) CreateGoogleAccount(_ context.Context, a svc.NewAccount, sub string) (svc.Account, error) {
	s.mu.Lock()
	s.rows = append(s.rows, &gRow{id: a.ID.String(), email: a.Email, sub: sub})
	s.mu.Unlock()
	return svc.Account{
		ID: a.ID, Email: a.Email, Organisation: a.Organisation, SessionVersion: 1,
		TermsAcceptedAt: a.TermsAcceptedAt, CreatedAt: time.Now(),
	}, nil
}

func (s *gAccounts) GetRecord(_ context.Context, id string) (session.Record, error) {
	if s.find(func(r *gRow) bool { return r.id == id }) == nil {
		return session.Record{}, session.ErrNoAccount
	}
	return session.Record{Role: session.RoleUser, Status: session.StatusActive, Version: 1}, nil
}
func (s *gAccounts) BumpVersion(context.Context, string) (int, error) { return 2, nil }
func (s *gAccounts) GetProfile(_ context.Context, id string) (session.Profile, error) {
	r := s.find(func(r *gRow) bool { return r.id == id })
	if r == nil {
		return session.Profile{}, session.ErrNoAccount
	}
	return session.Profile{
		ID: r.id, Email: r.email, Role: session.RoleUser, HasPassword: r.password, HasGoogle: r.sub != "",
		TermsAcceptedAt: time.Now(), CreatedAt: time.Now(),
	}, nil
}

type gEnv struct {
	t     *testing.T
	h     http.Handler
	fake  *oidctest.Provider
	accs  *gAccounts
	sess  *session.Service
	cache *gMem
}

func newGoogleEnv(t *testing.T) *gEnv {
	fake := oidctest.New(t, "cid")
	accs := &gAccounts{}
	cache := &gMem{m: map[string][]byte{}}
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accs, cache)
	if err != nil {
		t.Fatal(err)
	}
	idp := oidc.New(oidc.Config{Issuer: fake.Issuer(), ClientID: "cid", ClientSecret: "s", RedirectURL: webBase + "/cb"})
	g := svc.NewGoogle(idp, accs, cache, ss)
	h := &googleHandler{svc: g, sessions: ss, web: webBase}
	r := chi.NewRouter()
	r.Route("/api/v1/auth", func(r chi.Router) { h.mount(r, func(n http.Handler) http.Handler { return n }) })
	r.With(middleware.Session(ss)).Delete("/api/v1/account/google", unlinkGoogle(g, ss))
	return &gEnv{t: t, h: r, fake: fake, accs: accs, sess: ss, cache: cache}
}

// do sends a request with cookies and checks the response against the
// OpenAPI contract.
func (e *gEnv) do(method, path, body string, cookies ...*http.Cookie) *http.Response {
	e.t.Helper()
	var rd *bytes.Reader
	if body != "" {
		rd = bytes.NewReader([]byte(body))
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, c := range cookies {
		if c != nil {
			req.AddCookie(c)
		}
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	spec, err := api.GetSpec()
	if err != nil {
		e.t.Fatal(err)
	}
	creq := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	creq.Header = req.Header
	if err := contract.Validate(spec, creq, w.Result()); err != nil {
		e.t.Fatalf("%s %s does not match the contract: %v", method, path, err)
	}
	return w.Result()
}

func cookie(resp *http.Response, name string) *http.Cookie {
	for _, c := range resp.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func (e *gEnv) sessionCookie(id string) *http.Cookie {
	tok, _ := e.sess.Issue(id, 1, false)
	return &http.Cookie{Name: session.CookieName, Value: tok}
}

// start runs startGoogleAuth and lets the fake provider accept code "code"
// for id. It returns the state and the browser-binding cookie.
func (e *gEnv) start(intent string, id oidctest.Identity, cookies ...*http.Cookie) (string, *http.Cookie) {
	e.t.Helper()
	resp := e.do(http.MethodPost, "/api/v1/auth/google/start", `{"intent":"`+intent+`"}`, cookies...)
	if resp.StatusCode != http.StatusOK {
		e.t.Fatalf("start %s: %d", intent, resp.StatusCode)
	}
	var body api.GoogleStartResponse
	decodeJSON(e.t, resp, &body)
	u, _ := url.Parse(body.AuthorizationUrl)
	q := u.Query()
	e.fake.Grant("code", q.Get("nonce"), q.Get("code_challenge"), id)
	return q.Get("state"), cookie(resp, googleStateCookie)
}

func (e *gEnv) callback(state string, cookies ...*http.Cookie) (*http.Response, string) {
	e.t.Helper()
	resp := e.do(http.MethodGet, "/api/v1/auth/google/callback?code=code&state="+url.QueryEscape(state), "", cookies...)
	if resp.StatusCode != http.StatusFound {
		e.t.Fatalf("callback status %d", resp.StatusCode)
	}
	return resp, resp.Header.Get("Location")
}

var alice = oidctest.Identity{Subject: "g-alice", Email: "alice@example.com", EmailVerified: true}

func TestGoogleSignupFlow(t *testing.T) {
	e := newGoogleEnv(t)
	state, bind := e.start("signup", alice)
	if bind == nil || !bind.HttpOnly || bind.Value != state {
		t.Fatalf("state cookie %+v", bind)
	}
	resp, loc := e.callback(state, bind)
	if loc != webBase+"/register/google?result=needs_signup" {
		t.Fatalf("location %s", loc)
	}
	pending := cookie(resp, googlePendingCookie)
	if pending == nil || !pending.HttpOnly || cookie(resp, session.CookieName) != nil {
		t.Fatal("want the pending cookie and no session yet")
	}
	if resp := e.do(http.MethodGet, "/api/v1/auth/google/pending", "", pending); resp.StatusCode != http.StatusOK {
		t.Fatalf("pending: %d", resp.StatusCode)
	}
	if resp := e.do(http.MethodPost, "/api/v1/auth/google/complete", `{"retention_accepted":false,"terms_accepted":true}`, pending); resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("retention not accepted: %d", resp.StatusCode)
	}
	resp = e.do(http.MethodPost, "/api/v1/auth/google/complete", `{"organisation":"บริษัท","retention_accepted":true,"terms_accepted":true}`, pending)
	if resp.StatusCode != http.StatusCreated || cookie(resp, session.CookieName) == nil {
		t.Fatalf("complete: %d", resp.StatusCode)
	}
	if len(e.accs.rows) != 1 || e.accs.rows[0].sub != "g-alice" {
		t.Fatalf("accounts %+v", e.accs.rows)
	}
	if resp := e.do(http.MethodGet, "/api/v1/auth/google/pending", "", pending); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("pending after complete: %d", resp.StatusCode)
	}
}

func TestGoogleLoginExistingEmailLinks(t *testing.T) {
	e := newGoogleEnv(t)
	e.accs.rows = []*gRow{{id: uuid.NewString(), email: "alice@example.com", password: true}}
	state, bind := e.start("login", alice)
	resp, loc := e.callback(state, bind)
	if loc != webBase+"/login?result=logged_in" || cookie(resp, session.CookieName) == nil {
		t.Fatalf("location %s", loc)
	}
	if e.accs.rows[0].sub != "g-alice" {
		t.Fatal("google id not linked")
	}
}

func TestGoogleCallbackRejects(t *testing.T) {
	e := newGoogleEnv(t)
	e.accs.rows = []*gRow{{id: uuid.NewString(), email: "alice@example.com", sub: "g-alice"}}
	failed := webBase + "/login?result=failed"

	state, bind := e.start("login", alice)
	if _, loc := e.callback(state+"x", &http.Cookie{Name: googleStateCookie, Value: state + "x"}); loc != failed {
		t.Fatalf("tampered state: %s", loc)
	}
	if resp, loc := e.callback(state); loc != failed || cookie(resp, session.CookieName) != nil {
		t.Fatalf("state without its browser cookie: %s", loc)
	}
	// The state was not used up by the attempts above.
	if _, loc := e.callback(state, bind); loc != webBase+"/login?result=logged_in" {
		t.Fatalf("valid: %s", loc)
	}

	raw := e.do(http.MethodPost, "/api/v1/auth/google/start", `{"intent":"login"}`)
	var body api.GoogleStartResponse
	decodeJSON(t, raw, &body)
	u, _ := url.Parse(body.AuthorizationUrl)
	e.fake.Grant("code", "wrong-nonce", u.Query().Get("code_challenge"), alice)
	if resp, loc := e.callback(u.Query().Get("state"), cookie(raw, googleStateCookie)); loc != webBase+"/login?result=failed" || cookie(resp, session.CookieName) != nil {
		t.Fatalf("wrong nonce: %s", loc)
	}

	unverified := alice
	unverified.EmailVerified = false
	state, bind = e.start("login", unverified)
	if resp, loc := e.callback(state, bind); loc != failed || cookie(resp, session.CookieName) != nil {
		t.Fatalf("unverified e-mail: %s", loc)
	}
}

func TestGoogleCancelled(t *testing.T) {
	e := newGoogleEnv(t)
	state, bind := e.start("signup", alice)
	resp := e.do(http.MethodGet, "/api/v1/auth/google/callback?error=access_denied&state="+state, "", bind)
	if loc := resp.Header.Get("Location"); loc != webBase+"/register/google?result=cancelled" {
		t.Fatalf("location %s", loc)
	}
}

func TestGoogleStartChecks(t *testing.T) {
	e := newGoogleEnv(t)
	if resp := e.do(http.MethodPost, "/api/v1/auth/google/start", `{"intent":"link"}`); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("link without session: %d", resp.StatusCode)
	}
	if resp := e.do(http.MethodPost, "/api/v1/auth/google/start", `{"intent":"bogus"}`); resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("bad intent: %d", resp.StatusCode)
	}
	id := uuid.NewString()
	e.accs.rows = []*gRow{{id: id, email: "bob@example.com", sub: "g-bob", password: true}}
	if resp := e.do(http.MethodPost, "/api/v1/auth/google/start", `{"intent":"link"}`, e.sessionCookie(id)); resp.StatusCode != http.StatusConflict {
		t.Fatalf("link when linked: %d", resp.StatusCode)
	}
}

func TestGoogleLinkFlow(t *testing.T) {
	e := newGoogleEnv(t)
	id := uuid.NewString()
	e.accs.rows = []*gRow{{id: id, email: "bob@example.com", password: true}}
	sc := e.sessionCookie(id)
	state, bind := e.start("link", alice, sc)
	if _, loc := e.callback(state, bind, sc); loc != webBase+"/account?result=linked" {
		t.Fatalf("location %s", loc)
	}
	if e.accs.rows[0].sub != "g-alice" {
		t.Fatal("not linked")
	}
}

func TestUnlinkGoogle(t *testing.T) {
	e := newGoogleEnv(t)
	googleOnly, withPassword := uuid.NewString(), uuid.NewString()
	e.accs.rows = []*gRow{
		{id: googleOnly, email: "a@example.com", sub: "g-a"},
		{id: withPassword, email: "b@example.com", sub: "g-b", password: true},
	}
	resp := e.do(http.MethodDelete, "/api/v1/account/google", "", e.sessionCookie(googleOnly))
	if resp.StatusCode != http.StatusConflict || !strings.Contains(readBody(t, resp), "password_required") {
		t.Fatalf("unlink without password: %d", resp.StatusCode)
	}
	if resp := e.do(http.MethodDelete, "/api/v1/account/google", "", e.sessionCookie(withPassword)); resp.StatusCode != http.StatusOK {
		t.Fatalf("unlink: %d", resp.StatusCode)
	}
	resp = e.do(http.MethodDelete, "/api/v1/account/google", "", e.sessionCookie(withPassword))
	if resp.StatusCode != http.StatusConflict || !strings.Contains(readBody(t, resp), "google_not_linked") {
		t.Fatalf("unlink twice: %d", resp.StatusCode)
	}
	if resp := e.do(http.MethodDelete, "/api/v1/account/google", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no session: %d", resp.StatusCode)
	}
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func decodeJSON(t *testing.T, resp *http.Response, v any) {
	t.Helper()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatal(err)
	}
}

// A reauth sign-in sets the key that account deletion reads, so a Google-only
// account can delete itself (UC-04).
func TestGoogleReauthSetsAccountKey(t *testing.T) {
	e := newGoogleEnv(t)
	id := uuid.NewString()
	e.accs.rows = []*gRow{{id: id, email: "alice@example.com", sub: "g-alice"}}
	sc := e.sessionCookie(id)
	state, bind := e.start("reauth", alice, sc)
	if _, ok := e.cache.m[account.ReauthKey(id)]; ok {
		t.Fatal("key set before the callback")
	}
	if _, loc := e.callback(state, bind, sc); loc != webBase+"/account?result=reauthenticated" {
		t.Fatalf("location %s", loc)
	}
	if _, ok := e.cache.m[account.ReauthKey(id)]; !ok {
		t.Fatal("account:reauth key not set")
	}

	// Another Google identity does not reauthenticate this account.
	other := oidctest.Identity{Subject: "g-eve", Email: "eve@example.com", EmailVerified: true}
	delete(e.cache.m, account.ReauthKey(id))
	state, bind = e.start("reauth", other, sc)
	if _, loc := e.callback(state, bind, sc); loc != webBase+"/account?result=failed" {
		t.Fatalf("other identity: %s", loc)
	}
	if _, ok := e.cache.m[account.ReauthKey(id)]; ok {
		t.Fatal("key set for another Google identity")
	}
}

func TestGoogleStateReplayedOrExpired(t *testing.T) {
	e := newGoogleEnv(t)
	e.accs.rows = []*gRow{{id: uuid.NewString(), email: "alice@example.com", sub: "g-alice"}}
	state, bind := e.start("login", alice)
	if _, loc := e.callback(state, bind); loc != webBase+"/login?result=logged_in" {
		t.Fatalf("first use: %s", loc)
	}
	if resp, loc := e.callback(state, bind); loc != webBase+"/login?result=failed" || cookie(resp, session.CookieName) != nil {
		t.Fatalf("replayed state: %s", loc)
	}
	state, bind = e.start("login", alice)
	for k := range e.cache.m { // the 10 minute TTL ran out
		if strings.HasPrefix(k, "google:state:") {
			delete(e.cache.m, k)
		}
	}
	if resp, loc := e.callback(state, bind); loc != webBase+"/login?result=failed" || cookie(resp, session.CookieName) != nil {
		t.Fatalf("expired state: %s", loc)
	}
}

// Without Google credentials the routes stay mounted and answer 503.
func TestGoogleUnavailableWithoutConfig(t *testing.T) {
	t.Setenv("GOOGLE_CLIENT_ID", "")
	r := chi.NewRouter()
	googleRoutes(r, app.Deps{})
	for _, c := range [][2]string{
		{http.MethodPost, "/google/start"},
		{http.MethodGet, "/google/callback"},
		{http.MethodGet, "/google/pending"},
		{http.MethodPost, "/google/complete"},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(c[0], c[1], nil))
		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s %s: %d, want 503", c[0], c[1], w.Code)
		}
	}
}
