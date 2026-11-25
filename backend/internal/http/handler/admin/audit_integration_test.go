package admin_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strconv"
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

// auditCache is an in-memory valkey.StateStore for session tests.
type auditCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *auditCache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *auditCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.m[k]; ok {
		return v, nil
	}
	return nil, valkey.ErrNotFound
}

func (c *auditCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}

func (*auditCache) Incr(context.Context, string, time.Duration) (int64, error) { return 0, nil }
func (*auditCache) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return true, nil
}

type auditEnv struct {
	db   *pgxpool.Pool
	sess *session.Service
	h    http.Handler
	spec *openapi3.T
}

func auditSetup(t *testing.T) auditEnv {
	t.Helper()
	db := testutil.NewDB(t)
	sess, err := session.New(session.Config{Secret: bytes.Repeat([]byte("k"), 32)}, session.PGStore{DB: db},
		&auditCache{m: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	d := app.Deps{DB: db, Sessions: sess}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP(nil))
	r.With(middleware.Session(sess), middleware.RequireRole(session.RoleAdmin)).
		Route("/api/v1/admin", func(r chi.Router) { admin.Routes(r, d) })
	return auditEnv{db: db, sess: sess, h: r, spec: loadAuditSpec(t)}
}

// loadAuditSpec loads the bundled OpenAPI file, bundling it first when make gen has
// not run yet. The test skips only when node itself is unavailable.
func loadAuditSpec(t *testing.T) *openapi3.T {
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

func (e auditEnv) get(t *testing.T, as testutil.Account, method, path string) *http.Response {
	t.Helper()
	var ver int
	if err := e.db.QueryRow(context.Background(),
		`SELECT session_version FROM account WHERE id = $1`, as.ID).Scan(&ver); err != nil {
		t.Fatal(err)
	}
	tok, _ := e.sess.Issue(as.ID, ver, false)
	req := httptest.NewRequest(method, "/api/v1/admin"+path, nil)
	req.RemoteAddr = "198.51.100.7:1234"
	req.AddCookie(&http.Cookie{Name: session.CookieName, Value: tok})
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	// The contract declares no 500; every other status must match it.
	if err := contract.Validate(e.spec, req, resp); err != nil && resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("%s %s -> %d violates contract: %v", method, path, resp.StatusCode, err)
	}
	return resp
}

func adminAcct(t *testing.T, db *pgxpool.Pool) testutil.Account {
	t.Helper()
	return testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
}

func insertAudit(t *testing.T, db *pgxpool.Pool, adminID, action, targetType, targetID, at string) int64 {
	t.Helper()
	var id int64
	err := db.QueryRow(context.Background(), `
		INSERT INTO audit_log (occurred_at, admin_id, action, target_type, target_id, old_value, new_value, request_id, ip_address)
		VALUES ($1::timestamptz, $2, $3::audit_action, $4, $5, '{"role":"user"}', '{"role":"admin"}', 'req-1', '203.0.113.9')
		RETURNING id`, at, adminID, action, targetType, targetID).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

type listBody struct {
	Items []struct {
		ID         int64   `json:"id"`
		AdminEmail *string `json:"admin_email"`
		Action     string  `json:"action"`
		TargetID   string  `json:"target_id"`
	} `json:"items"`
	Raw struct {
		Page     int `json:"page"`
		PageSize int `json:"page_size"`
		Total    int `json:"total"`
	} `json:"meta"`
}

func decodeList(t *testing.T, resp *http.Response) listBody {
	t.Helper()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var b listBody
	if err := json.NewDecoder(resp.Body).Decode(&b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestAuditNonAdminForbidden(t *testing.T) {
	e := auditSetup(t)
	u := testutil.NewAccount(t, e.db)
	for _, p := range []string{"/audit-log", "/audit-log/1"} {
		if got := e.get(t, u, http.MethodGet, p).StatusCode; got != http.StatusForbidden {
			t.Errorf("%s status = %d, want 403", p, got)
		}
	}
}

func TestAuditListNewestFirstAndFilters(t *testing.T) {
	e := auditSetup(t)
	a1, a2 := adminAcct(t, e.db), adminAcct(t, e.db)
	old := insertAudit(t, e.db, a1.ID, "user_role_change", "account", "u1", "2026-01-01T00:00:00Z")
	mid := insertAudit(t, e.db, a2.ID, "advice_edit", "advice_item", "a1", "2026-02-01T00:00:00Z")
	same := insertAudit(t, e.db, a1.ID, "user_delete", "account", "u2", "2026-02-01T00:00:00Z")
	recent := insertAudit(t, e.db, a1.ID, "user_role_change", "account", "u1", "2026-03-01T00:00:00Z")

	b := decodeList(t, e.get(t, a1, http.MethodGet, "/audit-log"))
	want := []int64{recent, same, mid, old} // time desc, id desc on a tie
	if len(b.Items) != 4 || b.Raw.Total != 4 {
		t.Fatalf("items = %d total = %d, want 4", len(b.Items), b.Raw.Total)
	}
	for i, id := range want {
		if b.Items[i].ID != id {
			t.Errorf("item %d id = %d, want %d", i, b.Items[i].ID, id)
		}
	}
	if b.Items[0].AdminEmail == nil || *b.Items[0].AdminEmail != a1.Email {
		t.Errorf("admin_email = %v, want %s", b.Items[0].AdminEmail, a1.Email)
	}

	cases := []struct {
		query string
		ids   []int64
	}{
		{"?admin_id=" + a2.ID, []int64{mid}},
		{"?action=user_role_change", []int64{recent, old}},
		{"?target_type=account&target_id=u1", []int64{recent, old}},
		{"?target_type=account", []int64{recent, same, old}},
		{"?from=2026-02-01T00:00:00Z&to=2026-03-01T00:00:00Z", []int64{same, mid}},
		{"?admin_id=" + a1.ID + "&action=user_role_change&from=2026-02-15T00:00:00Z", []int64{recent}},
		{"?action=export_request", nil},
	}
	for _, c := range cases {
		got := decodeList(t, e.get(t, a1, http.MethodGet, "/audit-log"+c.query))
		if len(got.Items) != len(c.ids) || got.Raw.Total != len(c.ids) {
			t.Errorf("%s: items = %d total = %d, want %d", c.query, len(got.Items), got.Raw.Total, len(c.ids))
			continue
		}
		for i, id := range c.ids {
			if got.Items[i].ID != id {
				t.Errorf("%s: item %d = %d, want %d", c.query, i, got.Items[i].ID, id)
			}
		}
	}
}

func TestAuditListPaging(t *testing.T) {
	e := auditSetup(t)
	a := adminAcct(t, e.db)
	for i := range 5 {
		insertAudit(t, e.db, a.ID, "advice_edit", "advice_item", "x", "2026-01-0"+string(rune('1'+i))+"T00:00:00Z")
	}
	b := decodeList(t, e.get(t, a, http.MethodGet, "/audit-log?page=2&page_size=2"))
	if len(b.Items) != 2 || b.Raw.Total != 5 || b.Raw.Page != 2 || b.Raw.PageSize != 2 {
		t.Errorf("page 2 = %+v", b)
	}
	b = decodeList(t, e.get(t, a, http.MethodGet, "/audit-log?page=9"))
	if len(b.Items) != 0 || b.Raw.Total != 5 {
		t.Errorf("past the end = %+v", b)
	}
}

func TestAuditListValidation(t *testing.T) {
	e := auditSetup(t)
	a := adminAcct(t, e.db)
	for _, q := range []string{
		"?admin_id=nope", "?action=nope", "?target_id=u1", "?from=yesterday", "?to=2026-01-01",
		"?page=0", "?page_size=101", "?page_size=x",
	} {
		if got := e.get(t, a, http.MethodGet, "/audit-log"+q).StatusCode; got != http.StatusBadRequest {
			t.Errorf("%s status = %d, want 400", q, got)
		}
	}
}

func TestAuditAnonymisedAdminHasNullEmail(t *testing.T) {
	e := auditSetup(t)
	viewer := adminAcct(t, e.db)
	gone := adminAcct(t, e.db)
	insertAudit(t, e.db, gone.ID, "user_delete", "account", "u1", "2026-01-01T00:00:00Z")
	if _, err := e.db.Exec(context.Background(), `UPDATE account SET email = NULL, password_hash = NULL,
		google_sub = NULL, status = 'deleted', deleted_at = now() WHERE id = $1`, gone.ID); err != nil {
		t.Fatal(err)
	}
	b := decodeList(t, e.get(t, viewer, http.MethodGet, "/audit-log"))
	if len(b.Items) != 1 || b.Items[0].AdminEmail != nil {
		t.Errorf("items = %+v, want one entry with null admin_email", b.Items)
	}
}

func TestAuditGetEntry(t *testing.T) {
	e := auditSetup(t)
	a := adminAcct(t, e.db)
	id := insertAudit(t, e.db, a.ID, "user_role_change", "account", "u1", "2026-01-01T00:00:00Z")
	resp := e.get(t, a, http.MethodGet, "/audit-log/"+auditItoa(id))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(resp.Body)
	for _, want := range []string{
		`"old_value":{"role":"user"}`, `"new_value":{"role":"admin"}`,
		`"request_id":"req-1"`, `"ip_address":"203.0.113.9"`,
	} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("body lacks %s: %s", want, buf.String())
		}
	}
	for _, p := range []string{"/audit-log/999999", "/audit-log/abc"} {
		if got := e.get(t, a, http.MethodGet, p).StatusCode; got != http.StatusNotFound {
			t.Errorf("%s status = %d, want 404", p, got)
		}
	}
}

func TestAuditHasNoWriteRoutes(t *testing.T) {
	e := auditSetup(t)
	a := adminAcct(t, e.db)
	id := insertAudit(t, e.db, a.ID, "advice_edit", "advice_item", "a", "2026-01-01T00:00:00Z")
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		for _, p := range []string{"/audit-log", "/audit-log/" + auditItoa(id)} {
			req := httptest.NewRequest(m, "/api/v1/admin"+p, nil)
			var ver int
			_ = e.db.QueryRow(context.Background(), `SELECT session_version FROM account WHERE id = $1`, a.ID).Scan(&ver)
			tok, _ := e.sess.Issue(a.ID, ver, false)
			req.AddCookie(&http.Cookie{Name: session.CookieName, Value: tok})
			rec := httptest.NewRecorder()
			e.h.ServeHTTP(rec, req)
			if rec.Code != http.StatusNotFound && rec.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s status = %d, want 404 or 405", m, p, rec.Code)
			}
		}
	}
}

func auditItoa(n int64) string { return strconv.FormatInt(n, 10) }
