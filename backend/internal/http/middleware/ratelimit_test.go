package middleware_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
)

type fakeStore struct {
	mu  sync.Mutex
	n   map[string]int64
	err error
}

func (f *fakeStore) Incr(_ context.Context, key string, _ time.Duration) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return 0, f.err
	}
	if f.n == nil {
		f.n = map[string]int64{}
	}
	f.n[key]++
	return f.n[key], nil
}

func (*fakeStore) Set(context.Context, string, []byte, time.Duration) error { return nil }
func (*fakeStore) Get(context.Context, string) ([]byte, error)              { return nil, nil }
func (*fakeStore) Del(context.Context, ...string) error                     { return nil }
func (*fakeStore) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return false, nil
}

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	_, _ = w.Write(b)
})

func do(h http.Handler, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
	return rec
}

func TestRateLimitBlocksAfterLimit(t *testing.T) {
	h := middleware.RateLimit(&fakeStore{}, "t", 2, 90*time.Second, func(*http.Request) string { return "k" })(okHandler)
	for i := range 2 {
		if c := do(h, "").Code; c != 200 {
			t.Fatalf("req %d: %d", i, c)
		}
	}
	rec := do(h, "")
	if rec.Code != 429 || rec.Header().Get("Retry-After") != "90" {
		t.Fatalf("got %d retry=%q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if !strings.Contains(rec.Body.String(), `"code":"rate_limited"`) || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("body %s", rec.Body)
	}
}

func TestRateLimitEmptyKeySkipsAndStoreErrorFailsOpen(t *testing.T) {
	s := &fakeStore{}
	h := middleware.RateLimit(s, "t", 1, time.Minute, func(*http.Request) string { return "" })(okHandler)
	for range 3 {
		if c := do(h, "").Code; c != 200 {
			t.Fatalf("empty key blocked: %d", c)
		}
	}
	s.err = context.DeadlineExceeded
	h = middleware.RateLimit(s, "t", 1, time.Minute, func(*http.Request) string { return "k" })(okHandler)
	if c := do(h, "").Code; c != 200 {
		t.Fatalf("fail open: %d", c)
	}
}

func TestKeyEmailNormalisesAndRestoresBody(t *testing.T) {
	body := `{"email":"  Foo@Example.COM ","password":"x"}`
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	if k := middleware.KeyEmail(r); k != "foo@example.com" {
		t.Fatalf("key %q", k)
	}
	if b, _ := io.ReadAll(r.Body); string(b) != body {
		t.Fatalf("body not restored: %s", b)
	}
	for _, bad := range []string{"", "not json", `{"x":1}`} {
		if k := middleware.KeyEmail(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(bad))); k != "" {
			t.Fatalf("%q -> %q", bad, k)
		}
	}
}

func TestLimitFromEnv(t *testing.T) {
	t.Setenv("X_LIMIT", "7")
	t.Setenv("X_WINDOW", "30s")
	if l, w := middleware.LimitFromEnv("X", 1, time.Hour); l != 7 || w != 30*time.Second {
		t.Fatalf("%d %v", l, w)
	}
	t.Setenv("X_LIMIT", "bad")
	t.Setenv("X_WINDOW", "-1s")
	if l, w := middleware.LimitFromEnv("X", 1, time.Hour); l != 1 || w != time.Hour {
		t.Fatalf("%d %v", l, w)
	}
}

func TestLimitFromEnvDaySuffix(t *testing.T) {
	t.Setenv("D_LIMIT", "3")
	t.Setenv("D_WINDOW", "2d")
	if l, w := middleware.LimitFromEnv("D", 1, time.Hour); l != 3 || w != 48*time.Hour {
		t.Fatalf("%d %v", l, w)
	}
	t.Setenv("D_WINDOW", "xd")
	if _, w := middleware.LimitFromEnv("D", 1, time.Hour); w != time.Hour {
		t.Fatalf("bad day window -> %v", w)
	}
}
