package session

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

type fakeStore struct {
	mu    sync.Mutex
	recs  map[string]Record
	reads int
}

func (f *fakeStore) GetRecord(_ context.Context, id string) (Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	r, ok := f.recs[id]
	if !ok {
		return Record{}, ErrNoAccount
	}
	return r, nil
}

func (f *fakeStore) BumpVersion(_ context.Context, id string) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.recs[id]
	if !ok {
		return 0, ErrNoAccount
	}
	r.Version++
	f.recs[id] = r
	return r.Version, nil
}

type fakeCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *fakeCache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *fakeCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	if !ok {
		return nil, valkey.ErrNotFound
	}
	return v, nil
}

func (c *fakeCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}

func (c *fakeCache) Incr(context.Context, string, time.Duration) (int64, error) { return 0, nil }

func (c *fakeCache) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return false, nil
}

func setup(t *testing.T) (*Service, *fakeStore) {
	t.Helper()
	st := &fakeStore{recs: map[string]Record{"a1": {Role: RoleUser, Status: StatusActive, Version: 1}}}
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32))}, st, &fakeCache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	return svc, st
}

func TestAuthenticateOK(t *testing.T) {
	svc, st := setup(t)
	tok, _ := svc.Issue("a1", 1, false)
	p, err := svc.Authenticate(context.Background(), tok)
	if err != nil || p.AccountID != "a1" || p.Role != RoleUser {
		t.Fatalf("got %+v, %v", p, err)
	}
	if _, err := svc.Authenticate(context.Background(), tok); err != nil {
		t.Fatal(err)
	}
	if st.reads != 1 {
		t.Fatalf("second call should hit the cache, reads=%d", st.reads)
	}
}

func TestRoleComesFromRecord(t *testing.T) {
	svc, st := setup(t)
	tok, _ := svc.Issue("a1", 1, false)
	st.recs["a1"] = Record{Role: RoleAdmin, Status: StatusActive, Version: 1}
	p, err := svc.Authenticate(context.Background(), tok)
	if err != nil || p.Role != RoleAdmin {
		t.Fatalf("got %+v, %v", p, err)
	}
}

func TestBumpEndsOldSessionsAtOnce(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	old, _ := svc.Issue("a1", 1, false)
	if _, err := svc.Authenticate(ctx, old); err != nil { // fills the cache
		t.Fatal(err)
	}
	v, err := svc.BumpVersion(ctx, "a1")
	if err != nil || v != 2 {
		t.Fatalf("bump: %d, %v", v, err)
	}
	if _, err := svc.Authenticate(ctx, old); !errors.Is(err, ErrRevoked) {
		t.Fatalf("old cookie: %v", err)
	}
	fresh, _ := svc.Issue("a1", v, false)
	if _, err := svc.Authenticate(ctx, fresh); err != nil {
		t.Fatalf("new cookie: %v", err)
	}
}

func TestInactiveAndMissingAccounts(t *testing.T) {
	svc, st := setup(t)
	ctx := context.Background()
	for _, status := range []string{StatusDeactivated, StatusDeleted} {
		st.recs["a1"] = Record{Role: RoleUser, Status: status, Version: 1}
		_ = svc.Forget(ctx, "a1")
		tok, _ := svc.Issue("a1", 1, false)
		if _, err := svc.Authenticate(ctx, tok); !errors.Is(err, ErrRevoked) {
			t.Fatalf("%s: %v", status, err)
		}
	}
	tok, _ := svc.Issue("ghost", 1, false)
	if _, err := svc.Authenticate(ctx, tok); !errors.Is(err, ErrRevoked) {
		t.Fatalf("ghost: %v", err)
	}
}

func TestTokenValidation(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	tok, _ := svc.Issue("a1", 1, false)
	parts := strings.Split(tok, ".")
	bad := []string{
		"", "x.y.z", tok + "x",
		parts[0] + "." + parts[1] + ".AAAA",
		// alg none
		"eyJhbGciOiJub25lIn0." + parts[1] + ".",
	}
	for _, b := range bad {
		if _, err := svc.Authenticate(ctx, b); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%q: %v", b, err)
		}
	}
	other, _ := New(Config{Secret: []byte(strings.Repeat("z", 32))}, &fakeStore{}, &fakeCache{m: map[string][]byte{}})
	foreign, _ := other.Issue("a1", 1, false)
	if _, err := svc.Authenticate(ctx, foreign); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("foreign key: %v", err)
	}
}

func TestExpiryAndLifetimes(t *testing.T) {
	svc, _ := setup(t)
	base := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return base }
	short, e1 := svc.Issue("a1", 1, false)
	long, e2 := svc.Issue("a1", 1, true)
	if e1.Sub(base) != 12*time.Hour || e2.Sub(base) != 30*24*time.Hour {
		t.Fatalf("ttl: %v %v", e1.Sub(base), e2.Sub(base))
	}
	svc.now = func() time.Time { return base.Add(13 * time.Hour) }
	if _, err := svc.Authenticate(context.Background(), short); !errors.Is(err, ErrExpired) {
		t.Fatalf("short: %v", err)
	}
	if _, err := svc.Authenticate(context.Background(), long); err != nil {
		t.Fatalf("long: %v", err)
	}
}

func TestShortSecretRejected(t *testing.T) {
	if _, err := New(Config{Secret: []byte("short")}, &fakeStore{}, &fakeCache{}); err == nil {
		t.Fatal("want error")
	}
}

func TestCookies(t *testing.T) {
	svc, _ := setup(t)
	exp := time.Now().Add(time.Hour)

	w := httptest.NewRecorder()
	svc.SetCookie(w, "tok", exp, false)
	c := w.Result().Cookies()[0]
	if c.Name != CookieName || !c.HttpOnly || !c.Secure || c.Path != "/" ||
		c.SameSite != http.SameSiteLaxMode || c.MaxAge != 0 || !c.Expires.IsZero() {
		t.Fatalf("session cookie: %+v", c)
	}

	w = httptest.NewRecorder()
	svc.SetCookie(w, "tok", exp, true)
	if c := w.Result().Cookies()[0]; c.MaxAge <= 0 {
		t.Fatalf("remembered cookie must persist: %+v", c)
	}

	w = httptest.NewRecorder()
	svc.ClearCookie(w)
	if c := w.Result().Cookies()[0]; c.MaxAge >= 0 || c.Value != "" {
		t.Fatalf("clear: %+v", c)
	}
}
