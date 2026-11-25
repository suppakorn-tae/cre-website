package projects

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/projects"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const ownerHeader = "X-Test-Owner"

type env struct {
	h    http.Handler
	spec *openapi3.T
	a, b string
	db   testutil.DB
}

func newEnv(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	db := testutil.NewDB(t)
	spec, err := api.GetSpec()
	if err != nil {
		t.Fatal(err)
	}
	h := &handler{
		svc: projects.New(db, func() time.Time { return time.Date(2027, 7, 1, 12, 0, 0, 0, time.UTC) }),
		owner: func(r *http.Request) (uuid.UUID, bool) {
			id, err := uuid.Parse(r.Header.Get(ownerHeader))
			return id, err == nil
		},
	}
	r := chi.NewRouter()
	r.Route("/api/v1/projects", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/", h.create)
		r.Get("/{project_id}", h.get)
		r.Patch("/{project_id}", h.update)
		r.Delete("/{project_id}", h.delete)
	})
	return env{h: r, spec: spec, db: db, a: testutil.NewAccount(t, db).ID, b: testutil.NewAccount(t, db).ID}
}

// do sends a request as owner and checks the response against the OpenAPI
// spec before returning it.
func (e env) do(t *testing.T, owner, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if owner != "" {
		req.Header.Set(ownerHeader, owner)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if err := contract.Validate(e.spec, req, w.Result()); err != nil {
		t.Errorf("%s %s -> %d violates the contract: %v\n%s", method, path, w.Code, err, w.Body)
	}
	return w
}

const createJSON = `{"name":"Hotel","nickname":"HTL1","island_code":"koh_tao","type_code":"building",
"start_date":"2027-01-01","end_date":"2027-12-31","value_baht":123456789012.34}`

func decodeProject(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("body: %v %s", err, w.Body)
	}
	return m
}

func TestCreateGetUpdateDelete(t *testing.T) {
	e := newEnv(t)

	w := e.do(t, e.a, "POST", "/projects", createJSON)
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	p := decodeProject(t, w)
	id := p["id"].(string)
	if p["progress_pct"] != float64(0) || p["expected_progress_pct"] != float64(50) ||
		p["version_count"] != float64(0) || p["latest_version_no"] != nil || p["description"] != nil {
		t.Fatalf("created: %v", p)
	}
	// 15 digits survive the round trip exactly.
	if !strings.Contains(w.Body.String(), `"value_baht":123456789012.34`) {
		t.Fatalf("value_baht: %s", w.Body)
	}
	if loc := w.Header().Get("Location"); loc != "/api/v1/projects/"+id {
		t.Fatalf("location %q", loc)
	}

	if w := e.do(t, e.a, "GET", "/projects/"+id, ""); w.Code != 200 {
		t.Fatalf("get: %d %s", w.Code, w.Body)
	}

	w = e.do(t, e.a, "PATCH", "/projects/"+id, `{"name":"Hotel 2","progress_pct":30,"description":"x"}`)
	if w.Code != 200 {
		t.Fatalf("patch: %d %s", w.Code, w.Body)
	}
	p = decodeProject(t, w)
	if p["name"] != "Hotel 2" || p["progress_pct"] != float64(30) || p["description"] != "x" || p["nickname"] != "HTL1" {
		t.Fatalf("patched: %v", p)
	}
	w = e.do(t, e.a, "PATCH", "/projects/"+id, `{"description":null}`)
	if w.Code != 200 || decodeProject(t, w)["description"] != nil {
		t.Fatalf("clear: %d %s", w.Code, w.Body)
	}

	if w := e.do(t, e.a, "DELETE", "/projects/"+id, ""); w.Code != 204 || w.Body.Len() != 0 {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	for _, m := range []string{"GET", "DELETE"} {
		if w := e.do(t, e.a, m, "/projects/"+id, ""); w.Code != 404 {
			t.Fatalf("%s deleted: %d", m, w.Code)
		}
	}
	if w := e.do(t, e.a, "PATCH", "/projects/"+id, `{"name":"z"}`); w.Code != 404 {
		t.Fatalf("patch deleted: %d", w.Code)
	}
}

func TestOtherUsersProjectIs404OnEveryEndpoint(t *testing.T) {
	e := newEnv(t)
	p := testutil.NewProject(t, e.db, e.a)
	path := "/projects/" + p.ID
	for _, c := range []struct{ method, body string }{
		{"GET", ""}, {"PATCH", `{"name":"x"}`}, {"DELETE", ""},
	} {
		if w := e.do(t, e.b, c.method, path, c.body); w.Code != 404 {
			t.Errorf("%s as other user: %d %s", c.method, w.Code, w.Body)
		}
	}
	w := e.do(t, e.b, "GET", "/projects", "")
	if w.Code != 200 || decodeProject(t, w)["total"] != float64(0) {
		t.Fatalf("list as other user: %d %s", w.Code, w.Body)
	}
	// A path id cannot be used to reach it either, and bad ids are 404.
	if w := e.do(t, e.a, "GET", "/projects/not-a-uuid", ""); w.Code != 404 {
		t.Fatalf("bad id: %d", w.Code)
	}
	// The owner still has it.
	if w := e.do(t, e.a, "GET", path, ""); w.Code != 200 {
		t.Fatalf("owner: %d", w.Code)
	}
}

func TestUnauthenticatedIs401(t *testing.T) {
	e := newEnv(t)
	for _, c := range []struct{ method, path, body string }{
		{"GET", "/projects", ""},
		{"POST", "/projects", createJSON},
		{"GET", "/projects/" + uuid.NewString(), ""},
		{"PATCH", "/projects/" + uuid.NewString(), `{"name":"x"}`},
		{"DELETE", "/projects/" + uuid.NewString(), ""},
	} {
		if w := e.do(t, "", c.method, c.path, c.body); w.Code != 401 {
			t.Errorf("%s %s: %d", c.method, c.path, w.Code)
		}
	}
}

func TestRoutesRequireSession(t *testing.T) {
	// Routes wires d.Auth: with the real principal lookup and no session
	// the handler answers 401, and d.Auth runs first when set.
	called := false
	d := app.Deps{Auth: func(_ http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			called = true
			w.WriteHeader(http.StatusUnauthorized)
		})
	}}
	r := chi.NewRouter()
	r.Route("/projects", func(r chi.Router) { Routes(r, d) })
	for _, p := range []string{"/projects", "/projects/" + uuid.NewString()} {
		called = false
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", p, nil).WithContext(context.Background()))
		if !called || w.Code != 401 {
			t.Fatalf("%s: auth called=%v code=%d", p, called, w.Code)
		}
	}
}

func TestValidation(t *testing.T) {
	e := newEnv(t)
	p := testutil.NewProject(t, e.db, e.a)

	field := func(w *httptest.ResponseRecorder) []string {
		var env api.ValidationErrorEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, f := range env.Error.Fields {
			out = append(out, f.Field+":"+f.Code)
		}
		return out
	}
	create := func(mod func(string) string) *httptest.ResponseRecorder {
		return e.do(t, e.a, "POST", "/projects", mod(createJSON))
	}

	for name, c := range map[string]struct {
		mod  func(string) string
		want string
	}{
		"end before start": {func(s string) string { return strings.Replace(s, `"2027-12-31"`, `"2026-12-31"`, 1) }, "/end_date:must_be_after_start"},
		"value zero":       {func(s string) string { return strings.Replace(s, "123456789012.34", "0", 1) }, "/value_baht:must_be_positive"},
		"value negative":   {func(s string) string { return strings.Replace(s, "123456789012.34", "-1", 1) }, "/value_baht:must_be_positive"},
		"progress 101":     {func(s string) string { return strings.Replace(s, `"value_baht"`, `"progress_pct":101,"value_baht"`, 1) }, "/progress_pct:out_of_range"},
		"progress -1":      {func(s string) string { return strings.Replace(s, `"value_baht"`, `"progress_pct":-1,"value_baht"`, 1) }, "/progress_pct:out_of_range"},
		"blank name":       {func(s string) string { return strings.Replace(s, `"Hotel"`, `"  "`, 1) }, "/name:required"},
		"other no text":    {func(s string) string { return strings.Replace(s, `"koh_tao"`, `"other"`, 1) }, "/island_other:required"},
		"missing value":    {func(s string) string { return strings.Replace(s, `,"value_baht":123456789012.34`, "", 1) }, "/value_baht:required"},
	} {
		w := create(c.mod)
		if w.Code != 422 || len(field(w)) != 1 || field(w)[0] != c.want {
			t.Errorf("%s: %d %v %s", name, w.Code, field(w), w.Body)
		}
	}

	// Boundaries are accepted.
	if w := create(func(s string) string { return strings.Replace(s, `"value_baht"`, `"progress_pct":100,"value_baht"`, 1) }); w.Code != 201 {
		t.Errorf("progress 100: %d %s", w.Code, w.Body)
	}

	// Malformed input is 400, not 422.
	for name, body := range map[string]string{
		"not json":      `{`,
		"string value":  strings.Replace(createJSON, "123456789012.34", `"12"`, 1),
		"progress frac": strings.Replace(createJSON, `"value_baht"`, `"progress_pct":1.5,"value_baht"`, 1),
		"array":         `[]`,
	} {
		if w := e.do(t, e.a, "POST", "/projects", body); w.Code != 400 {
			t.Errorf("create %s: %d %s", name, w.Code, w.Body)
		}
	}
	for name, body := range map[string]string{
		"empty":    `{}`,
		"unknown":  `{"owner_id":"` + e.b + `"}`,
		"bad type": `{"name":5}`,
	} {
		if w := e.do(t, e.a, "PATCH", "/projects/"+p.ID, body); w.Code != 400 {
			t.Errorf("patch %s: %d %s", name, w.Code, w.Body)
		}
	}
	// Patch result is validated as a whole.
	if w := e.do(t, e.a, "PATCH", "/projects/"+p.ID, `{"value_baht":-3}`); w.Code != 422 {
		t.Errorf("patch value: %d %s", w.Code, w.Body)
	}
}

func TestListQueryAndPaging(t *testing.T) {
	e := newEnv(t)
	for _, n := range []string{"Alpha", "Beta", "Gamma"} {
		body := strings.Replace(createJSON, `"Hotel"`, `"`+n+`"`, 1)
		if w := e.do(t, e.a, "POST", "/projects", body); w.Code != 201 {
			t.Fatal(w.Body)
		}
	}
	w := e.do(t, e.a, "GET", "/projects?page_size=2&page=2", "")
	m := decodeProject(t, w)
	items := m["items"].([]any)
	if w.Code != 200 || len(items) != 1 || m["total"] != float64(3) || m["page"] != float64(2) || m["page_size"] != float64(2) {
		t.Fatalf("page 2: %d %s", w.Code, w.Body)
	}
	w = e.do(t, e.a, "GET", "/projects?q=bet", "")
	if m := decodeProject(t, w); m["total"] != float64(1) || m["items"].([]any)[0].(map[string]any)["name"] != "Beta" {
		t.Fatalf("q: %s", w.Body)
	}
	for _, q := range []string{"page=0", "page=x", "page_size=0", "page_size=101", "q=" + strings.Repeat("a", 201)} {
		if w := e.do(t, e.a, "GET", "/projects?"+q, ""); w.Code != 400 {
			t.Errorf("%s: %d", q, w.Code)
		}
	}
}
