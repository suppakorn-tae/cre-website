package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

type store struct {
	mu   sync.Mutex
	recs map[string]session.Record
}

func (s *store) GetRecord(_ context.Context, id string) (session.Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.recs[id]
	if !ok {
		return session.Record{}, session.ErrNoAccount
	}
	return r, nil
}

func (s *store) BumpVersion(_ context.Context, id string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.recs[id]
	r.Version++
	s.recs[id] = r
	return r.Version, nil
}

type cache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *cache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *cache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.m[k]; ok {
		return v, nil
	}
	return nil, valkey.ErrNotFound
}

func (c *cache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}
func (c *cache) Incr(context.Context, string, time.Duration) (int64, error) { return 0, nil }
func (c *cache) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return false, nil
}

func newSvc(t *testing.T) *session.Service {
	t.Helper()
	st := &store{recs: map[string]session.Record{
		"user":  {Role: session.RoleUser, Status: session.StatusActive, Version: 1},
		"admin": {Role: session.RoleAdmin, Status: session.StatusActive, Version: 1},
	}}
	svc, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, st, &cache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	return svc
}

func app(svc *session.Service) http.Handler {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, _ := middleware.PrincipalFrom(r.Context())
		_, _ = w.Write([]byte(p.AccountID + ":" + p.Role))
	})
	mux := http.NewServeMux()
	mux.Handle("/me", middleware.Session(svc)(ok))
	mux.Handle("/admin/x", middleware.Session(svc)(middleware.RequireRole(session.RoleAdmin)(ok)))
	return mux
}

func doGet(h http.Handler, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestSessionMiddleware(t *testing.T) {
	svc := newSvc(t)
	h := app(svc)
	tok, _ := svc.Issue("user", 1, false)

	if w := doGet(h, "/me", ""); w.Code != 401 || !strings.Contains(w.Body.String(), `"unauthenticated"`) {
		t.Fatalf("no cookie: %d %s", w.Code, w.Body)
	}
	if w := doGet(h, "/me", "garbage"); w.Code != 401 {
		t.Fatalf("garbage: %d", w.Code)
	}
	if w := doGet(h, "/me", tok); w.Code != 200 || w.Body.String() != "user:user" {
		t.Fatalf("ok: %d %s", w.Code, w.Body)
	}
}

func TestBumpGivesOldCookie401(t *testing.T) {
	svc := newSvc(t)
	h := app(svc)
	tok, _ := svc.Issue("user", 1, false)
	if w := doGet(h, "/me", tok); w.Code != 200 {
		t.Fatalf("before: %d", w.Code)
	}
	if _, err := svc.BumpVersion(context.Background(), "user"); err != nil {
		t.Fatal(err)
	}
	if w := doGet(h, "/me", tok); w.Code != 401 {
		t.Fatalf("after bump: %d", w.Code)
	}
}

func TestRequireRole(t *testing.T) {
	svc := newSvc(t)
	h := app(svc)
	u, _ := svc.Issue("user", 1, false)
	a, _ := svc.Issue("admin", 1, false)
	if w := doGet(h, "/admin/x", u); w.Code != 403 || !strings.Contains(w.Body.String(), `"forbidden"`) {
		t.Fatalf("user: %d %s", w.Code, w.Body)
	}
	if w := doGet(h, "/admin/x", a); w.Code != 200 {
		t.Fatalf("admin: %d", w.Code)
	}
	if w := doGet(h, "/admin/x", ""); w.Code != 401 {
		t.Fatalf("anon: %d", w.Code)
	}
	// RequireRole without Session in front never lets a request through.
	bare := middleware.RequireRole(session.RoleAdmin)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	if w := doGet(bare, "/", ""); w.Code != 401 {
		t.Fatalf("bare: %d", w.Code)
	}
}
