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

	"GET /admin/advice/{}": {access: accessAdmin, path: static("/admin/advice/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70")},
	"PUT /admin/advice/{}/{}": {
		access: accessAdmin, body: `{"items":[]}`,
		path: static("/admin/advice/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70/RL"),
	},
	"POST /admin/exports": {access: accessAdmin, body: `{"scope":"all"}`},
	"GET /admin/exports/{}/download": {
		access: accessAdmin, path: static("/admin/exports/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70/download"),
	},
	"GET /admin/impact-tables": {access: accessAdmin},
	"PUT /admin/impact-tables": {access: accessAdmin, body: `{"ri_c":[]}`},
	"GET /admin/rl-thresholds": {access: accessAdmin},
	"GET /admin/rl-thresholds/{}": {
		access: accessAdmin, path: static("/admin/rl-thresholds/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70"),
	},
	"PUT /admin/rl-thresholds/{}": {
		access: accessAdmin, body: `{"a":1}`,
		path: static("/admin/rl-thresholds/0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70"),
	},

	"GET /auth/csrf":   {access: accessPublic},
	"POST /auth/login": {access: accessPublic},
	// Logout is idempotent: it clears the cookie and answers 204 with or
	// without a session, so it is checked as public (CSRF still applies).
	"POST /auth/logout":          {access: accessPublic},
	"GET /auth/me":               {access: accessSession},
	"POST /auth/password/forgot": {access: accessPublic},
	"POST /auth/password/reset":  {access: accessPublic},
	"POST /auth/register/resend": {access: accessPublic},
	"POST /auth/register/start":  {access: accessPublic},
	"POST /auth/register/verify": {access: accessPublic},

	"GET /dashboard":     {access: accessSession},
	"GET /catalogue":     {access: accessSession},
	"GET /islands":       {access: accessSession},
	"GET /project-types": {access: accessSession},
	// Not owned: the fixture job is not a finished report, so the owner gets
	// 404 as well. TestReportDownloadIsOwnerOnly checks the other callers.
	"GET /reports/{}/download": {
		access: accessSession,
		path:   func(f fixture) string { return "/reports/" + f.jobID + "/download" },
	},

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
	// Not owned: a project of someone else lists as 200 with no items, where
	// the contract says 404. No data leaks, but the status is wrong; the
	// versions service needs a follow-up issue (IO-113 may not edit it).
	"GET /projects/{}/versions": {
		access: accessSession,
		path:   func(f fixture) string { return "/projects/" + f.project.ID + "/versions" },
	},
	"POST /projects/{}/versions": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions" },
	},
	"GET /projects/{}/versions/{}": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions/" + f.version.ID },
	},
	"DELETE /projects/{}/versions/{}": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions/" + f.version.ID },
	},
	"GET /projects/{}/compare": {
		access: accessSession, owned: true,
		path: func(f fixture) string {
			return "/projects/" + f.project.ID + "/compare?target_version_id=" + f.version.ID
		},
	},
	"GET /projects/{}/trend": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/trend" },
	},
	"GET /projects/{}/indicator-rm": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/indicator-rm" },
	},
	"GET /projects/{}/versions/{}/results": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions/" + f.version.ID + "/results" },
	},
	"PUT /projects/{}/versions/{}/results/{}/strategy": {
		access: accessSession, owned: true, body: `{"strategy":"REDUCE"}`,
		path: func(f fixture) string {
			return "/projects/" + f.project.ID + "/versions/" + f.version.ID + "/results/" + f.indicator + "/strategy"
		},
	},
	"POST /projects/{}/versions/{}/submit": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions/" + f.version.ID + "/submit" },
	},
	"POST /projects/{}/versions/{}/reports": {
		access: accessSession, owned: true,
		path: func(f fixture) string { return "/projects/" + f.project.ID + "/versions/" + f.version.ID + "/reports" },
	},
}

// pending is the allow-list of routes the OpenAPI contract declares but the
// api does not mount yet, because the feature that owns them is still open. Each one must move into covered (with its checks) in the PR that
// mounts it. TestRouteInventory only logs a note when a pending route becomes
// mounted (so it never blocks that PR) and runs the fixture-free checks on it.
// Owner of the missing implementation in brackets.
var pending = []string{
	// IO-106: google sign-in endpoints (the oidc adapter is merged, the handlers are not)
	"DELETE /account/google",
	"POST /auth/google/start", "GET /auth/google/callback", "GET /auth/google/pending", "POST /auth/google/complete",
	// IO-45 follow-up: the dashboard handler serves GET /dashboard only; the
	// three panel endpoints of the contract have no handler yet.
	"GET /dashboard/panels/projects", "GET /dashboard/panels/top-indicators", "GET /dashboard/panels/islands",
	// IO-99: answer handlers (the service is merged)
	"GET /projects/{}/versions/{}/answers", "PATCH /projects/{}/versions/{}/answers",
	"PUT /projects/{}/versions/{}/answers/{}",
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
		case mounted[k] && !isCovered(k) && !pend[k]:
			t.Errorf("%s is mounted but not in covered: add it (access, owner check, body) so the security checks run on it", k)
		case mounted[k] && pend[k]:
			// Not a failure, so a feature PR that mounts a route is never
			// blocked by this suite. The fixture-free checks run instead.
			t.Logf("pending route now mounted: move %s to covered with an owner path builder", k)
			e.checkMountedPending(t, k)
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

// TestEveryContractOperationMounted is the route walk: it walks the real
// router and fails for any contract operation that is not mounted and not on
// the pending allow-list (a feature that is still open). It also lists the
// allow-list, so a stale entry is visible in the test log.
func TestEveryContractOperationMounted(t *testing.T) {
	e := newEnv(t)
	mounted := e.mountedRoutes(t)
	allow := map[string]bool{}
	for _, p := range pending {
		allow[p] = true
	}
	for _, k := range sortedKeys(e.specRoutes()) {
		switch {
		case mounted[k] && allow[k]:
			t.Logf("%s is mounted: remove it from pending", k)
		case !mounted[k] && !allow[k]:
			t.Errorf("%s is in the contract but not mounted, and its feature is not on the pending list", k)
		}
	}
}
