package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
)

func startValkey(t *testing.T) string {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
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
	return ep
}

// instance builds one "api replica": its own Valkey client and middleware,
// limiting per IP (header X-Test-IP stands in for RealIP) and per e-mail.
func instance(t *testing.T, url string) http.Handler {
	t.Helper()
	c, err := valkey.New(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	ip := func(r *http.Request) string { return r.Header.Get("X-Test-IP") }
	h := http.Handler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	h = middleware.RateLimit(c, "email", 2, time.Minute, middleware.KeyEmail)(h)
	return middleware.RateLimit(c, "ip", 3, time.Minute, ip)(h)
}

func call(h http.Handler, ip, body string) int {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("X-Test-IP", ip)
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestRateLimitSharedAcrossInstances(t *testing.T) {
	url := startValkey(t)
	a, b := instance(t, url), instance(t, url)

	// Per e-mail (limit 2): one request on each instance, the third is
	// blocked even from a fresh IP. Different spelling is the same e-mail.
	if c := call(a, "1.1.1.1", `{"email":"u@x.com"}`); c != 204 {
		t.Fatalf("1: %d", c)
	}
	if c := call(b, "1.1.1.2", `{"email":"U@X.com"}`); c != 204 {
		t.Fatalf("2: %d", c)
	}
	if c := call(a, "1.1.1.3", `{"email":" u@x.com"}`); c != 429 {
		t.Fatalf("email limit not shared: %d", c)
	}
	// Another e-mail from another IP is unaffected: independent counters.
	if c := call(b, "2.2.2.2", `{"email":"other@x.com"}`); c != 204 {
		t.Fatalf("other email: %d", c)
	}

	// Per IP (limit 3): three allowed across both instances, the fourth is
	// blocked even with a new e-mail.
	for i, h := range []http.Handler{a, b, a} {
		if c := call(h, "9.9.9.9", `{"email":"e`+string(rune('a'+i))+`@x.com"}`); c != 204 {
			t.Fatalf("ip req %d: %d", i, c)
		}
	}
	if c := call(b, "9.9.9.9", `{"email":"new@x.com"}`); c != 429 {
		t.Fatalf("ip limit not shared: %d", c)
	}
}
