package middleware_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
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

func (s *store) GetProfile(_ context.Context, id string) (session.Profile, error) {
	return session.Profile{ID: id}, nil
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
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
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

type auditDB struct{ args []any }

func (d *auditDB) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	d.args = args
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func (d *auditDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
}

func (d *auditDB) QueryRow(context.Context, string, ...any) pgx.Row { return errRow{} }

type errRow struct{}

func (errRow) Scan(...any) error { return errors.New("unexpected query row") }

// An admin request carries the admin id and client IP in its context, so an
// audit entry written from it needs nothing else; a user request does not.
func TestSessionPutsAuditContextOnAdminRequests(t *testing.T) {
	const adminID = "0193a5c2-7b1e-7c3a-9d4f-2a6b8e1f5c70"
	st := &store{recs: map[string]session.Record{
		adminID: {Role: session.RoleAdmin, Status: session.StatusActive, Version: 1},
		"user":  {Role: session.RoleUser, Status: session.StatusActive, Version: 1},
	}}
	svc, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, st, &cache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	var recErr error
	var db auditDB
	h := middleware.RequestID(middleware.RealIP(nil)(middleware.Session(svc)(
		http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
			recErr = audit.New(audit.NewRepository()).Record(r.Context(), &db, audit.Entry{
				Action: audit.UserDeactivate, TargetType: "account", TargetID: "x",
			})
		}))))

	call := func(account string) {
		tok, _ := svc.Issue(account, 1, false)
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "203.0.113.9:4000"
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: tok}) //nolint:gosec // G124: test request cookie, never sent to a browser
		h.ServeHTTP(httptest.NewRecorder(), req)
	}

	call(adminID)
	if recErr != nil {
		t.Fatalf("admin audit record: %v", recErr)
	}
	if len(db.args) == 0 || db.args[0] != uuid.MustParse(adminID) {
		t.Fatalf("admin id not written: %v", db.args)
	}
	var ipSeen bool
	for _, a := range db.args {
		if ip, ok := a.(*netip.Addr); ok && ip != nil && ip.String() == "203.0.113.9" {
			ipSeen = true
		}
	}
	if !ipSeen {
		t.Fatalf("client ip not written: %v", db.args)
	}

	call("user")
	if !errors.Is(recErr, audit.ErrNoAdmin) {
		t.Fatalf("user request must not carry an admin: %v", recErr)
	}
}

type failingStore struct{ *store }

func (*failingStore) GetRecord(context.Context, string) (session.Record, error) {
	return session.Record{}, errors.New("valkey and postgres down")
}

func TestSessionStoreFailureLogsCauseAndAnswers500(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(log.New(&buf, "info"))
	t.Cleanup(func() { slog.SetDefault(prev) })

	svc, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, &failingStore{}, &cache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := svc.Issue("user", 1, false)

	h := middleware.RequestID(app(svc))
	w := doGet(h, "/me", tok)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
	rid := w.Header().Get(middleware.RequestIDHeader)
	out := buf.String()
	if rid == "" || !strings.Contains(out, rid) || !strings.Contains(out, "valkey and postgres down") {
		t.Fatalf("log lacks request id %q or cause: %s", rid, out)
	}
}
