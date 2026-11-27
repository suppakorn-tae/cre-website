package admin_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

// memCache is an in-memory valkey.StateStore for session tests.
type memCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *memCache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *memCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.m[k]; ok {
		return v, nil
	}
	return nil, valkey.ErrNotFound
}

func (c *memCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}

func (*memCache) Incr(context.Context, string, time.Duration) (int64, error) { return 0, nil }
func (*memCache) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return true, nil
}

type env struct {
	db   *pgxpool.Pool
	own  *pgxpool.Pool // schema owner, for tests that change the schema
	sess *session.Service
	h    http.Handler
	spec *openapi3.T
}

func setup(t *testing.T) env {
	t.Helper()
	own := testutil.NewOwnerDB(t)
	db := testutil.NewAppPool(t, own)
	cache := &memCache{m: map[string][]byte{}}
	sess, err := session.New(session.Config{Secret: bytes.Repeat([]byte("k"), 32)}, session.PGStore{DB: db}, cache)
	if err != nil {
		t.Fatal(err)
	}
	d := app.Deps{DB: db, Sessions: sess}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP(nil))
	r.With(middleware.Session(sess), middleware.RequireRole(session.RoleAdmin)).
		Route("/api/v1/admin", func(r chi.Router) { admin.Routes(r, d) })

	spec := loadSpec(t)
	return env{db: db, own: own, sess: sess, h: r, spec: spec}
}

// loadSpec loads the bundled OpenAPI file, bundling it first when make gen has
// not run yet. The test skips only when node itself is unavailable.
func loadSpec(t *testing.T) *openapi3.T {
	t.Helper()
	const dist = "../../../../../contracts/openapi/dist/openapi.yaml"
	if _, err := os.Stat(dist); err != nil {
		cmd := exec.Command("node", "contracts/bundle.mjs")
		cmd.Dir = "../../../../.."
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

func (e env) do(t *testing.T, as testutil.Account, method, path, body string) *http.Response {
	t.Helper()
	var ver int
	if err := e.db.QueryRow(context.Background(),
		`SELECT session_version FROM account WHERE id = $1`, as.ID).Scan(&ver); err != nil {
		t.Fatal(err)
	}
	tok, _ := e.sess.Issue(as.ID, ver, false)
	return e.doToken(t, tok, method, path, body)
}

func (e env) doToken(t *testing.T, tok, method, path, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1/admin"+path, strings.NewReader(body))
	req.RemoteAddr = "198.51.100.7:1234"
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: session.CookieName, Value: tok})
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	// Contract check for every response.
	// The contract declares no 500; every other status must match it.
	if err := contract.Validate(e.spec, req, resp); err != nil && resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("%s %s -> %d violates contract: %v", method, path, resp.StatusCode, err)
	}
	return resp
}

func admin2(t *testing.T, db *pgxpool.Pool) testutil.Account {
	return testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
}

func auditCount(t *testing.T, db *pgxpool.Pool, action string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_log WHERE action = $1::audit_action`, action).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestNonAdminForbidden(t *testing.T) {
	e := setup(t)
	u := testutil.NewAccount(t, e.db)
	if got := e.do(t, u, http.MethodGet, "/users", "").StatusCode; got != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", got)
	}
}

func TestListSearchAndCountsOnly(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db, func(x *testutil.Account) { x.Email = "somchai@example.test" })
	p := testutil.NewProject(t, e.db, u.ID)
	testutil.NewVersionWithSnapshot(t, e.db, p.ID)
	testutil.NewVersionWithSnapshot(t, e.db, p.ID)

	resp := e.do(t, a, http.MethodGet, "/users?q=SOMCHAI&role=user&status=active", "")
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(resp.Body)
	body := buf.String()
	for _, want := range []string{`"project_count":1`, `"version_count":2`, `"total":1`, "somchai@example.test"} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %s: %s", want, body)
		}
	}
	if strings.Contains(body, "Test project") {
		t.Error("response leaks project content")
	}
	// Wildcards in the search are literal.
	resp = e.do(t, a, http.MethodGet, "/users?q=%25", "")
	buf.Reset()
	_, _ = buf.ReadFrom(resp.Body)
	if !strings.Contains(buf.String(), `"total":0`) {
		t.Errorf("percent matched everything: %s", buf.String())
	}
	if got := e.do(t, a, http.MethodGet, "/users?role=root", "").StatusCode; got != 422 {
		t.Errorf("bad role status = %d, want 422", got)
	}
	if got := e.do(t, a, http.MethodGet, "/users?page_size=101", "").StatusCode; got != 422 {
		t.Errorf("bad page size status = %d, want 422", got)
	}
}

func TestGetUser(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db)
	if got := e.do(t, a, http.MethodGet, "/users/"+u.ID, "").StatusCode; got != 200 {
		t.Errorf("status = %d", got)
	}
	if got := e.do(t, a, http.MethodGet, "/users/"+testutil.NewID(), "").StatusCode; got != 404 {
		t.Errorf("unknown status = %d", got)
	}
}

func TestDeactivateEndsSessionAndReactivate(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db)
	// Prime the session cache with the user's live token.
	tok, _ := e.sess.Issue(u.ID, 1, false)
	if _, err := e.sess.Authenticate(context.Background(), tok); err != nil {
		t.Fatal(err)
	}

	if got := e.do(t, a, http.MethodPost, "/users/"+u.ID+"/deactivate", "").StatusCode; got != 200 {
		t.Fatalf("deactivate status = %d", got)
	}
	if _, err := e.sess.Authenticate(context.Background(), tok); err == nil {
		t.Fatal("deactivated user's session still valid")
	}
	if got := e.do(t, a, http.MethodPost, "/users/"+u.ID+"/deactivate", "").StatusCode; got != 409 {
		t.Errorf("second deactivate = %d, want 409", got)
	}
	if got := e.do(t, a, http.MethodPost, "/users/"+u.ID+"/reactivate", "").StatusCode; got != 200 {
		t.Fatalf("reactivate status = %d", got)
	}
	if got := e.do(t, a, http.MethodPost, "/users/"+u.ID+"/reactivate", "").StatusCode; got != 409 {
		t.Errorf("second reactivate = %d, want 409", got)
	}
	if auditCount(t, e.db, "user_deactivate") != 1 || auditCount(t, e.db, "user_reactivate") != 1 {
		t.Error("expected one audit row per action")
	}
}

func TestChangeRole(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db)
	if got := e.do(t, a, http.MethodPut, "/users/"+u.ID+"/role", `{"role":"admin"}`).StatusCode; got != 200 {
		t.Fatalf("promote status = %d", got)
	}
	if auditCount(t, e.db, "user_role_change") != 1 {
		t.Error("no audit row for role change")
	}
	if got := e.do(t, a, http.MethodPut, "/users/"+u.ID+"/role", `{"role":"boss"}`).StatusCode; got != 422 {
		t.Errorf("bad role = %d, want 422", got)
	}
	if got := e.do(t, a, http.MethodPut, "/users/"+u.ID+"/role", `{`).StatusCode; got != 400 {
		t.Errorf("bad json = %d, want 400", got)
	}
	if got := e.do(t, a, http.MethodPut, "/users/"+a.ID+"/role", `{"role":"user"}`).StatusCode; got != 409 {
		t.Errorf("self demote = %d, want 409", got)
	}
}

func TestAdminCannotActOnOwnAccount(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	admin2(t, e.db)
	for _, c := range []struct{ m, p, body string }{
		{http.MethodDelete, "/users/" + a.ID, ""},
		{http.MethodPost, "/users/" + a.ID + "/deactivate", ""},
		{http.MethodPut, "/users/" + a.ID + "/role", `{"role":"user"}`},
	} {
		if got := e.do(t, a, c.m, c.p, c.body).StatusCode; got != 409 {
			t.Errorf("%s %s = %d, want 409", c.m, c.p, got)
		}
	}
}

func TestDeleteAnonymises(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db)
	p := testutil.NewProject(t, e.db, u.ID)
	tok, _ := e.sess.Issue(u.ID, 1, false)
	if _, err := e.sess.Authenticate(context.Background(), tok); err != nil {
		t.Fatal(err)
	}

	if got := e.do(t, a, http.MethodDelete, "/users/"+u.ID, "").StatusCode; got != 204 {
		t.Fatalf("delete status = %d", got)
	}
	var email, hash, google *string
	var status, pseudonym string
	var deletedAt *time.Time
	if err := e.db.QueryRow(context.Background(),
		`SELECT email::text, password_hash, google_sub, status::text, pseudonym, deleted_at
		   FROM account WHERE id = $1`, u.ID).Scan(&email, &hash, &google, &status, &pseudonym, &deletedAt); err != nil {
		t.Fatal(err)
	}
	if email != nil || hash != nil || google != nil || status != "deleted" || deletedAt == nil || pseudonym != u.Pseudonym {
		t.Errorf("not anonymised: %v %v %v %s %q %v", email, hash, google, status, pseudonym, deletedAt)
	}
	var n int
	_ = e.db.QueryRow(context.Background(), `SELECT count(*) FROM project WHERE id = $1`, p.ID).Scan(&n)
	if n != 1 {
		t.Error("project not kept")
	}
	if _, err := e.sess.Authenticate(context.Background(), tok); err == nil {
		t.Error("deleted user's session still valid")
	}
	if got := e.do(t, a, http.MethodDelete, "/users/"+u.ID, "").StatusCode; got != 409 {
		t.Errorf("second delete = %d, want 409", got)
	}
	if got := e.do(t, a, http.MethodDelete, "/users/"+a.ID, "").StatusCode; got != 409 {
		t.Errorf("self delete = %d, want 409", got)
	}
	if auditCount(t, e.db, "user_delete") != 1 {
		t.Error("expected one user_delete audit row")
	}
	var leaked int
	_ = e.db.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_log WHERE old_value::text LIKE '%@%' OR new_value::text LIKE '%@%'`).Scan(&leaked)
	if leaked != 0 {
		t.Error("audit row holds an e-mail")
	}
	// The e-mail can register again.
	testutil.NewAccount(t, e.db, func(x *testutil.Account) { x.Email = u.Email })
}

func TestActionRollsBackWithAudit(t *testing.T) {
	e := setup(t)
	a := admin2(t, e.db)
	u := testutil.NewAccount(t, e.db)
	// Make the audit insert fail by dropping the admin's row reference: a
	// token for an admin id that no longer exists cannot pass Session, so
	// instead break audit_log itself.
	if _, err := e.own.Exec(context.Background(), `ALTER TABLE audit_log RENAME TO audit_log_x`); err != nil {
		t.Fatal(err)
	}
	if got := e.do(t, a, http.MethodPost, "/users/"+u.ID+"/deactivate", "").StatusCode; got != 500 {
		t.Fatalf("status = %d, want 500", got)
	}
	var status string
	_ = e.db.QueryRow(context.Background(), `SELECT status::text FROM account WHERE id = $1`, u.ID).Scan(&status)
	if status != "active" {
		t.Errorf("status = %s: change not rolled back with failed audit", status)
	}
}
