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

func (f *fakeStore) GetProfile(_ context.Context, id string) (Profile, error) {
	if _, ok := f.recs[id]; !ok {
		return Profile{}, ErrNoAccount
	}
	return Profile{ID: id}, nil
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
	mu  sync.Mutex
	m   map[string][]byte
	now func() time.Time // optional clock; nil means entries never expire
	ttl map[string]time.Time
}

func (c *fakeCache) Set(_ context.Context, k string, v []byte, d time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	if c.now != nil {
		if c.ttl == nil {
			c.ttl = map[string]time.Time{}
		}
		c.ttl[k] = c.now().Add(d)
	}
	return nil
}

func (c *fakeCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	if !ok {
		return nil, valkey.ErrNotFound
	}
	if c.now != nil {
		if e, exp := c.ttl[k]; exp && !c.now().Before(e) {
			delete(c.m, k)
			delete(c.ttl, k)
			return nil, valkey.ErrNotFound
		}
	}
	return v, nil
}

func (c *fakeCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
		delete(c.ttl, k)
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

func TestRevokeEndsOnlyThatToken(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	a, _ := svc.Issue("a1", 1, false)
	b, _ := svc.Issue("a1", 1, false) // same account, version and second
	if a == b {
		t.Fatal("two sign-ins got the same token")
	}
	if _, err := svc.Authenticate(ctx, a); err != nil { // fills the record cache
		t.Fatal(err)
	}
	if err := svc.Revoke(ctx, a); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, a); !errors.Is(err, ErrRevoked) {
		t.Fatalf("revoked token: %v", err)
	}
	if _, err := svc.Authenticate(ctx, b); err != nil {
		t.Fatalf("other device: %v", err)
	}
	// Junk and forged tokens are ignored: they cannot be used anyway.
	for _, junk := range []string{"", "x.y.z", a + "x"} {
		if err := svc.Revoke(ctx, junk); err != nil {
			t.Errorf("%q: %v", junk, err)
		}
	}
}

func TestRevokeLastsUntilTheTokenExpires(t *testing.T) {
	base := time.Date(2026, 11, 28, 12, 0, 0, 0, time.UTC)
	now := base
	cache := &fakeCache{m: map[string][]byte{}, now: func() time.Time { return now }}
	st := &fakeStore{recs: map[string]Record{"a1": {Role: RoleUser, Status: StatusActive, Version: 1}}}
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32))}, st, cache)
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return now }
	tok, exp := svc.Issue("a1", 1, false)
	if err := svc.Revoke(context.Background(), tok); err != nil {
		t.Fatal(err)
	}
	if got := cache.ttl[revokedKey(tok)]; !got.Equal(exp) {
		t.Fatalf("revocation kept until %v, want the token expiry %v", got, exp)
	}
	if strings.Contains(revokedKey(tok), tok) {
		t.Fatal("the revocation key holds the raw token")
	}
}

type brokenCache struct{ fakeCache }

func (*brokenCache) Get(context.Context, string) ([]byte, error) {
	return nil, errors.New("valkey down")
}

func TestRevocationCheckFailsClosed(t *testing.T) {
	st := &fakeStore{recs: map[string]Record{"a1": {Role: RoleUser, Status: StatusActive, Version: 1}}}
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32))}, st, &brokenCache{fakeCache{m: map[string][]byte{}}})
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := svc.Issue("a1", 1, false)
	_, err = svc.Authenticate(context.Background(), tok)
	if err == nil || errors.Is(err, ErrRevoked) || errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want an infrastructure error, got %v", err)
	}
}

func TestRevokeRequestReadsTheCookie(t *testing.T) {
	svc, _ := setup(t)
	tok, _ := svc.Issue("a1", 1, false)
	r := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	if err := svc.RevokeRequest(r); err != nil { // no cookie: nothing to do
		t.Fatal(err)
	}
	r.AddCookie(&http.Cookie{Name: CookieName, Value: tok}) //nolint:gosec // G124: test request cookie, never sent to a browser
	if err := svc.RevokeRequest(r); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(context.Background(), tok); !errors.Is(err, ErrRevoked) {
		t.Fatalf("after RevokeRequest: %v", err)
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
	if c.Name != "__Host-cre_session" || !c.HttpOnly || !c.Secure || c.Path != "/" || c.Domain != "" ||
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
	if c := w.Result().Cookies()[0]; c.Name != CookieName || c.MaxAge >= 0 || c.Value != "" {
		t.Fatalf("clear: %+v", c)
	}
}

// Local http development drops the __Host- prefix, which browsers accept
// only on a Secure cookie; the service then reads the same name back.
func TestCookiesInsecureDropPrefix(t *testing.T) {
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32)), Insecure: true}, &fakeStore{}, &fakeCache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	if svc.CookieName() != "cre_session" {
		t.Fatalf("dev name %q", svc.CookieName())
	}
	w := httptest.NewRecorder()
	svc.SetCookie(w, "tok", time.Now().Add(time.Hour), false)
	if c := w.Result().Cookies()[0]; c.Name != "cre_session" || c.Secure || c.Path != "/" {
		t.Fatalf("dev cookie: %+v", c)
	}
	w = httptest.NewRecorder()
	svc.ClearCookie(w)
	if c := w.Result().Cookies()[0]; c.Name != "cre_session" || c.MaxAge >= 0 {
		t.Fatalf("dev clear: %+v", c)
	}
}

// racingStore returns the old record and runs onRead (a concurrent bump)
// before handing it over, like a reader that loaded the row just before the
// bump committed.
type racingStore struct {
	*fakeStore
	onRead func()
}

func (r *racingStore) GetRecord(ctx context.Context, id string) (Record, error) {
	rec, err := r.fakeStore.GetRecord(ctx, id)
	if r.onRead != nil {
		f := r.onRead
		r.onRead = nil
		f()
	}
	return rec, err
}

func TestBumpRacingCacheWriteDoesNotKeepOldRecord(t *testing.T) {
	ctx := context.Background()
	fs := &fakeStore{recs: map[string]Record{"a1": {Role: RoleUser, Status: StatusActive, Version: 1}}}
	rs := &racingStore{fakeStore: fs}
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32))}, rs, &fakeCache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	old, _ := svc.Issue("a1", 1, false)
	rs.onRead = func() {
		if _, err := svc.BumpVersion(ctx, "a1"); err != nil {
			t.Error(err)
		}
	}
	// This request read version 1, then the bump ran, then the stale record
	// was written to the cache.
	_, _ = svc.Authenticate(ctx, old)
	// The next request must not be served from that stale cache entry.
	if _, err := svc.Authenticate(ctx, old); !errors.Is(err, ErrRevoked) {
		t.Fatalf("old cookie after racing bump: %v", err)
	}
	fresh, _ := svc.Issue("a1", 2, false)
	if _, err := svc.Authenticate(ctx, fresh); err != nil {
		t.Fatalf("new cookie: %v", err)
	}
}

func TestPrincipalCarriesExpiryAndRemember(t *testing.T) {
	svc, _ := setup(t)
	base := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return base }
	for _, remember := range []bool{false, true} {
		tok, exp := svc.Issue("a1", 1, remember)
		p, err := svc.Authenticate(context.Background(), tok)
		if err != nil || !p.Expires.Equal(exp) || p.Remember != remember {
			t.Fatalf("remember=%v: %+v %v", remember, p, err)
		}
	}
}

// stalledStore hands out the record read at read time only after gate has
// run, like a database read that stalls for minutes.
type stalledStore struct {
	*fakeStore
	gate func()
}

func (s *stalledStore) GetRecord(ctx context.Context, id string) (Record, error) {
	rec, err := s.fakeStore.GetRecord(ctx, id)
	if s.gate != nil {
		g := s.gate
		s.gate = nil
		g()
	}
	return rec, err
}

// The request reads version 1; the bump commits while the read is stalled,
// and the cache write would land after the floor has expired. Without the
// freshness gate the stale record would revive the revoked session.
func TestBumpDuringStalledReadDoesNotReviveOldSession(t *testing.T) {
	ctx := context.Background()
	clock := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	fs := &fakeStore{recs: map[string]Record{"a1": {Role: RoleUser, Status: StatusActive, Version: 1}}}
	ss := &stalledStore{fakeStore: fs}
	cache := &fakeCache{m: map[string][]byte{}, now: func() time.Time { return clock }}
	svc, err := New(Config{Secret: []byte(strings.Repeat("k", 32))}, ss, cache)
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return clock }
	old, _ := svc.Issue("a1", 1, false)
	ss.gate = func() {
		if _, err := svc.BumpVersion(ctx, "a1"); err != nil {
			t.Error(err)
			return
		}
		clock = clock.Add(3 * time.Minute) // CacheTTL is 30s, floors live 60s
	}
	if _, err := svc.Authenticate(ctx, old); err != nil {
		t.Fatalf("in-flight request before the bump was visible: %v", err)
	}
	fresh, _ := svc.Issue("a1", 2, false)
	if _, err := svc.Authenticate(ctx, fresh); err != nil {
		t.Fatalf("new cookie after the bump: %v", err)
	}
	if _, err := svc.Authenticate(ctx, old); !errors.Is(err, ErrRevoked) {
		t.Fatalf("stalled read revived the revoked session: %v", err)
	}
}
