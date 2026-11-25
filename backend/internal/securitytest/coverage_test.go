package securitytest

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// access says who may call a route.
type access int

const (
	accessPublic  access = iota // no session needed
	accessSession               // any signed-in account, only ever its own data
	accessAdmin                 // role admin only
)

// route is one covered route. It is covered once it appears in the table
// below: the generic checks in security_test.go then run on it.
type route struct {
	access access
	// path builds a concrete path (without /api/v1). Routes with an object
	// id in the path use the fixture owned by alice. Nil for routes without
	// parameters, where key is used as is.
	path func(f fixture) string
	// owned marks routes that address an object owned by one user: another
	// user and an admin must get 404, never 403 and never the data.
	owned bool
	// body is a JSON request body that passes validation, for owned
	// mutations (so a 404 proves the ownership check, not a 400).
	body string
}

// covered lists every route that is mounted today, with the checks it gets.
// A mounted route missing here fails TestRouteInventory, so a new route
// cannot ship without security coverage.
var covered = map[string]route{
	"GET /account":          {access: accessSession},
	"PATCH /account":        {access: accessSession},
	"DELETE /account":       {access: accessSession},
	"PUT /account/password": {access: accessSession},

	"GET /admin/audit-log":            {access: accessAdmin},
	"GET /admin/audit-log/{}":         {access: accessAdmin, path: static("/admin/audit-log/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70")},
	"GET /admin/users":                {access: accessAdmin},
	"GET /admin/users/{}":             {access: accessAdmin, path: static("/admin/users/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70")},
	"DELETE /admin/users/{}":          {access: accessAdmin, path: static("/admin/users/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70")},
	"PUT /admin/users/{}/role":        {access: accessAdmin, path: static("/admin/users/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70/role")},
	"POST /admin/users/{}/deactivate": {access: accessAdmin, path: static("/admin/users/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70/deactivate")},
	"POST /admin/users/{}/reactivate": {access: accessAdmin, path: static("/admin/users/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70/reactivate")},

	"GET /auth/csrf":             {access: accessPublic},
	"POST /auth/login":           {access: accessPublic},
	"POST /auth/logout":          {access: accessSession},
	"GET /auth/me":               {access: accessSession},
	"POST /auth/password/forgot": {access: accessPublic},
	"POST /auth/password/reset":  {access: accessPublic},
	"POST /auth/register/resend": {access: accessPublic},
	"POST /auth/register/start":  {access: accessPublic},
	"POST /auth/register/verify": {access: accessPublic},

	"GET /jobs/{}": {access: accessSession, owned: true, path: func(f fixture) string { return "/jobs/" + f.jobID }},

	"GET /projects":  {access: accessSession},
	"POST /projects": {access: accessSession},
	"GET /projects/{}": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID },
	},
	"PATCH /projects/{}": {
		access: accessSession, owned: true, body: `{"name":"hijacked"}`,
		path: func(f fixture) string { return "/projects/" + f.project.ID },
	},
	"DELETE /projects/{}": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID },
	},
}

// pending lists the routes the OpenAPI contract declares but the api does not
// mount yet. Each one must move into covered (with its checks) in the PR that
// mounts it: TestRouteInventory fails when a pending route becomes mounted.
// Owner of the missing implementation in brackets.
var pending = []string{
	// admin: advice, impact tables, thresholds, exports
	"GET /admin/advice/{}", "PUT /admin/advice/{}/{}",
	"POST /admin/exports", "GET /admin/exports/{}/download",
	"GET /admin/rl-thresholds", "GET /admin/rl-thresholds/{}", "PUT /admin/rl-thresholds/{}",
	"GET /admin/impact-tables", "PUT /admin/impact-tables",
	// account: google
	"DELETE /account/google",
	// auth: google sign-in
	"POST /auth/google/start", "GET /auth/google/callback", "GET /auth/google/pending", "POST /auth/google/complete",
	// catalogue
	"GET /catalogue", "GET /islands", "GET /project-types",
	// assessments: answers, submit
	"GET /projects/{}/versions/{}/answers", "PATCH /projects/{}/versions/{}/answers",
	"PUT /projects/{}/versions/{}/answers/{}", "POST /projects/{}/versions/{}/submit",
	// versions
	"GET /projects/{}/versions", "POST /projects/{}/versions",
	"GET /projects/{}/versions/{}", "DELETE /projects/{}/versions/{}",
	// results, compare, trend
	"GET /projects/{}/versions/{}/results", "PUT /projects/{}/versions/{}/results/{}/strategy",
	"GET /projects/{}/compare", "GET /projects/{}/trend", "GET /projects/{}/indicator-rm",
	// dashboard
	"GET /dashboard", "GET /dashboard/panels/projects", "GET /dashboard/panels/top-indicators",
	"GET /dashboard/panels/islands",
	// reports
	"POST /projects/{}/versions/{}/reports", "GET /reports/{}/download",
}

func static(p string) func(fixture) string { return func(fixture) string { return p } }

var paramRe = regexp.MustCompile(`\{[^}]*\}`)

// norm turns /api/v1/projects/{project_id}/ into "/projects/{}".
func norm(path string) string {
	path = strings.TrimPrefix(path, "/api/v1")
	path = paramRe.ReplaceAllString(path, "{}")
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	return path
}

func (e *env) specRoutes() map[string]bool {
	out := map[string]bool{}
	for path, item := range e.spec.Paths.Map() {
		for method := range item.Operations() {
			out[method+" "+norm(path)] = true
		}
	}
	return out
}

// mountedRoutes returns the /api/v1 routes of the real router.
func (e *env) mountedRoutes(t *testing.T) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	err := chi.Walk(e.h.(chi.Routes), func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if strings.HasPrefix(path, "/api/v1/") {
			out[method+" "+norm(path)] = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// TestRouteInventory ties the OpenAPI contract, the mounted router and the
// two tables above together so coverage can only grow:
//   - a route in the contract that is neither covered nor pending fails (new route);
//   - a mounted route that is not covered fails (including one that was pending);
//   - a pending or covered route that the contract or the router lacks fails (stale).
func TestRouteInventory(t *testing.T) {
	e := newEnv(t)
	spec, mounted := e.specRoutes(), e.mountedRoutes(t)
	pend := map[string]bool{}
	for _, p := range pending {
		if pend[p] {
			t.Errorf("pending lists %q twice", p)
		}
		pend[p] = true
	}

	for _, k := range sortedKeys(spec) {
		switch {
		case !isCovered(k) && !pend[k] && !mounted[k]:
			t.Errorf("%s is in the contract but has no security coverage: mount it and add it to covered, or list it in pending", k)
		case mounted[k] && !isCovered(k):
			t.Errorf("%s is mounted but not in covered: add it (access, owner check, body) so the security checks run on it", k)
		case mounted[k] && pend[k]:
			t.Errorf("%s is mounted now: remove it from pending and add it to covered", k)
		}
	}
	for _, k := range sortedKeys(mounted) {
		if !spec[k] {
			t.Errorf("%s is mounted but not in the OpenAPI contract", k)
		}
	}
	for _, k := range sortedKeys(covered) {
		if !mounted[k] {
			t.Errorf("%s is in covered but not mounted: remove it", k)
		}
	}
	for k := range pend {
		if !spec[k] {
			t.Errorf("%s is in pending but not in the contract: remove it", k)
		}
	}
}

func isCovered(k string) bool { _, ok := covered[k]; return ok }
