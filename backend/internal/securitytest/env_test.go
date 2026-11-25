package securitytest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	apihttp "github.com/suppakorn-tae/cre-website/backend/internal/http"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

const origin = "https://app.example.com"

// who is a signed-in caller with a session token.
type who struct {
	testutil.Account
	token string
}

type env struct {
	h     http.Handler
	db    *pgxpool.Pool
	sess  *session.Service
	spec  *openapi3.T
	alice who // owns the data under test
	bob   who // another ordinary user
	admin who
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

// loadSpec loads the bundled OpenAPI file, bundling it first when make gen
// has not run. It skips only when node itself is unavailable.
func loadSpec(t *testing.T) *openapi3.T {
	t.Helper()
	const dist = "../../../contracts/openapi/dist/openapi.yaml"
	if _, err := os.Stat(dist); err != nil {
		cmd := exec.Command("node", "contracts/bundle.mjs")
		cmd.Dir = "../../.."
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Skipf("cannot bundle the OpenAPI spec: %v\n%s", err, out)
		}
	}
	spec, err := openapi3.NewLoader().LoadFromFile(dist)
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return spec
}

// newEnv builds the real router with production rate-limit defaults.
func newEnv(t *testing.T) *env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	spec := loadSpec(t)
	db := testutil.NewDB(t)
	cache := startValkey(t)

	d := app.Deps{Config: config.API{
		Env: "production", SessionSecret: strings.Repeat("s", 32),
		SessionTTL: time.Hour, RememberTTL: 24 * time.Hour,
		AllowedOrigins: []string{origin}, RequestTimeout: 5 * time.Second,
	}, Logger: log.New(new(strings.Builder), "error")}
	if err := d.WireAuth(db, cache); err != nil {
		t.Fatal(err)
	}
	e := &env{
		h:    apihttp.NewRouter(apihttp.Deps{Deps: d, Metrics: metrics.New(), Health: health.New(time.Second)}),
		db:   db,
		sess: d.Sessions,
		spec: spec,
	}
	mk := func(role, name string) who {
		a := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = role; a.Pseudonym = name })
		tok, _ := d.Sessions.Issue(a.ID, 1, false)
		return who{Account: a, token: tok}
	}
	e.alice, e.bob, e.admin = mk("user", "alice"), mk("user", "bob"), mk("admin", "root")
	return e
}

// req describes one request. csrf adds the matching cookie and header; the
// zero value of every other field means "leave it out".
type req struct {
	method, path string
	as           *who
	csrf         bool
	badCSRF      bool // header token differs from the cookie
	origin       string
	body         string
	addr         string // client address, for rate-limit tests
}

const csrfToken = "0123456789abcdef0123456789abcdef"

func (e *env) do(r req) *httptest.ResponseRecorder {
	hr := httptest.NewRequest(r.method, origin+"/api/v1"+r.path, strings.NewReader(r.body))
	hr.RemoteAddr = "198.51.100.7:4000"
	if r.addr != "" {
		hr.RemoteAddr = r.addr + ":4000"
	}
	if r.body != "" {
		hr.Header.Set("Content-Type", "application/json")
	}
	if r.as != nil {
		hr.AddCookie(&http.Cookie{Name: session.CookieName, Value: r.as.token})
	}
	if r.csrf {
		hr.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: csrfToken})
		hr.Header.Set(middleware.CSRFHeader, csrfToken)
	}
	if r.badCSRF {
		hr.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: csrfToken})
		hr.Header.Set(middleware.CSRFHeader, "ffffffffffffffffffffffffffffffff")
	}
	if r.origin != "" {
		hr.Header.Set("Origin", r.origin)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, hr)
	return w
}
