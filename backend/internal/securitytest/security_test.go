package securitytest

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

// fixture is the data alice owns and the others must not reach.
type fixture struct {
	project testutil.Project
	jobID   string
	// version is the project's only version: submitted, with an H result
	// for indicator.
	version   testutil.Version
	indicator string
}

func (e *env) newFixture(t *testing.T) fixture {
	t.Helper()
	f := fixture{
		project: testutil.NewProject(t, e.db, e.alice.ID),
		jobID:   testutil.NewID(),
	}
	f.version = testutil.NewVersionWithSnapshot(t, e.db, f.project.ID)
	if err := e.db.QueryRow(context.Background(), `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&f.indicator); err != nil {
		t.Fatal(err)
	}
	testutil.NewAnswer(t, e.db, f.version.ID, f.indicator)
	testutil.NewResult(t, e.db, f.version.ID, f.indicator)
	testutil.SubmitVersion(t, e.db, f.version.ID)
	if _, err := e.db.Exec(context.Background(),
		`INSERT INTO job (id, kind, requested_by) VALUES ($1, 'report', $2)`, f.jobID, e.alice.ID); err != nil {
		t.Fatal(err)
	}
	return f
}

// each runs fn as a subtest for every covered route that match keeps.
func each(t *testing.T, match func(r route) bool, fn func(t *testing.T, method, key string, r route)) {
	t.Helper()
	for _, key := range sortedKeys(covered) {
		r := covered[key]
		if !match(r) {
			continue
		}
		method, _, _ := strings.Cut(key, " ")
		t.Run(key, func(t *testing.T) { fn(t, method, key, r) })
	}
}

func pathOf(key string, r route, f fixture) string {
	if r.path != nil {
		return r.path(f)
	}
	_, p, _ := strings.Cut(key, " ")
	return p
}

func unsafe(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	return true
}

func all(route) bool         { return true }
func signedIn(r route) bool  { return r.access != accessPublic }
func adminOnly(r route) bool { return r.access == accessAdmin }
func owned(r route) bool     { return r.owned }

// callerFor is an account that is allowed to call the route.
func (e *env) callerFor(r route) *who {
	switch r.access {
	case accessAdmin:
		return &e.admin
	case accessSession:
		return &e.alice
	}
	return nil
}

func wantStatus(t *testing.T, got, want int, body string) {
	t.Helper()
	if got != want {
		t.Fatalf("status %d, want %d: %s", got, want, body)
	}
}

// Every route that needs a session answers 401 without one, even when the
// CSRF token is right, so CSRF never hides a missing login.
func TestSessionRequired(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	each(t, signedIn, func(t *testing.T, method, key string, r route) {
		w := e.do(req{method: method, path: pathOf(key, r, f), csrf: true})
		wantStatus(t, w.Code, http.StatusUnauthorized, w.Body.String())
	})
}

// Unsafe methods need the double-submit token and an allowed origin on every
// route, public or not. The control request (token, no origin header) must
// pass the CSRF check, so a 403 elsewhere is really the CSRF guard.
func TestCSRFOnEveryMutation(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	each(t, all, func(t *testing.T, method, key string, r route) {
		if !unsafe(method) {
			t.Skip("safe method")
		}
		path, as := pathOf(key, r, f), e.callerFor(r)

		w := e.do(req{method: method, path: path, as: as, body: r.bodyFor(f)})
		wantStatus(t, w.Code, http.StatusForbidden, w.Body.String())
		if !strings.Contains(w.Body.String(), "csrf_invalid") {
			t.Fatalf("no token: want csrf_invalid, got %s", w.Body)
		}
		for name, o := range map[string]string{
			"foreign origin": "https://evil.example",
			"wrong scheme":   "http://app.example.com",
			"null origin":    "null",
		} {
			w := e.do(req{method: method, path: path, as: as, csrf: true, origin: o, body: r.bodyFor(f)})
			if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "csrf_invalid") {
				t.Errorf("%s: status %d, want 403 csrf_invalid: %s", name, w.Code, w.Body)
			}
		}
		// A token that does not match the cookie is rejected too.
		w = e.do(req{method: method, path: path, as: as, badCSRF: true, body: r.bodyFor(f)})
		wantStatus(t, w.Code, http.StatusForbidden, w.Body.String())

		// Control: token and allowed origin get past the guard.
		w = e.do(req{method: method, path: path, as: as, csrf: true, origin: origin, body: r.bodyFor(f)})
		if w.Code == http.StatusForbidden && strings.Contains(w.Body.String(), "csrf_invalid") {
			t.Fatalf("valid token and origin rejected: %s", w.Body)
		}
	})
}

// A plain user, even with a valid session and token, never reaches /admin.
func TestAdminRoutesRefuseUsers(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	each(t, adminOnly, func(t *testing.T, method, key string, r route) {
		w := e.do(req{method: method, path: pathOf(key, r, f), as: &e.bob, csrf: true, body: r.bodyFor(f)})
		wantStatus(t, w.Code, http.StatusForbidden, w.Body.String())
	})
}

// Object-level authorisation: another user and an admin get 404 for alice's
// objects (not 403, so existence is not revealed), and nothing changes.
func TestObjectLevelAuthorisation(t *testing.T) {
	e := newEnv(t)
	each(t, owned, func(t *testing.T, method, key string, r route) {
		f := e.newFixture(t)
		path := pathOf(key, r, f)
		for _, c := range []struct {
			name string
			who  *who
		}{{"other user", &e.bob}, {"admin", &e.admin}} {
			w := e.do(req{method: method, path: path, as: c.who, csrf: true, body: r.bodyFor(f)})
			if w.Code != http.StatusNotFound {
				t.Errorf("%s: status %d, want 404: %s", c.name, w.Code, w.Body)
			}
			if strings.Contains(w.Body.String(), f.project.Name) || strings.Contains(w.Body.String(), f.project.Nickname) {
				t.Errorf("%s: body leaks the object: %s", c.name, w.Body)
			}
		}
		// Control: the owner reaches it, so the 404s above are the check.
		w := e.do(req{method: method, path: path, as: &e.alice, csrf: true, body: r.bodyFor(f)})
		if w.Code == http.StatusNotFound || w.Code == http.StatusForbidden || w.Code >= 500 {
			t.Errorf("owner: status %d: %s", w.Code, w.Body)
		}
	})

	t.Run("mutations by others change nothing", func(t *testing.T) {
		f := e.newFixture(t)
		p := "/projects/" + f.project.ID
		for _, c := range []*who{&e.bob, &e.admin} {
			e.do(req{method: "PATCH", path: p, as: c, csrf: true, body: `{"name":"hijacked"}`})
			e.do(req{method: "DELETE", path: p, as: c, csrf: true})
		}
		var name string
		var deleted bool
		if err := e.db.QueryRow(context.Background(),
			`SELECT name, deleted_at IS NOT NULL FROM project WHERE id = $1`, f.project.ID).Scan(&name, &deleted); err != nil {
			t.Fatal(err)
		}
		if name != f.project.Name || deleted {
			t.Fatalf("project changed: name %q deleted %v", name, deleted)
		}
	})
}

// Lists show only the caller's own rows, for an admin too (an admin path
// never reads other users' projects).
func TestListsOnlyShowOwnProjects(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	for _, c := range []*who{&e.bob, &e.admin} {
		w := e.do(req{method: "GET", path: "/projects", as: c})
		wantStatus(t, w.Code, http.StatusOK, w.Body.String())
		if strings.Contains(w.Body.String(), f.project.ID) {
			t.Errorf("%s sees alice's project in the list: %s", c.Pseudonym, w.Body)
		}
	}
	w := e.do(req{method: "GET", path: "/projects", as: &e.alice})
	if !strings.Contains(w.Body.String(), f.project.ID) {
		t.Fatalf("control: alice does not see her project: %s", w.Body)
	}
}

// A soft-deleted project is gone for its owner too: 404 on every verb, and
// not in the list.
func TestSoftDeletedProjectIs404(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	if _, err := e.db.Exec(context.Background(), `UPDATE project SET deleted_at = now() WHERE id = $1`, f.project.ID); err != nil {
		t.Fatal(err)
	}
	p := "/projects/" + f.project.ID
	for _, c := range []struct{ method, body string }{
		{"GET", ""}, {"PATCH", `{"name":"back"}`}, {"DELETE", ""},
	} {
		w := e.do(req{method: c.method, path: p, as: &e.alice, csrf: true, body: c.body})
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404: %s", c.method, w.Code, w.Body)
		}
	}
	w := e.do(req{method: "GET", path: "/projects", as: &e.alice})
	if strings.Contains(w.Body.String(), f.project.ID) {
		t.Errorf("deleted project is listed: %s", w.Body)
	}
}

// A session whose account was deactivated stops working at once.
func TestDeactivatedAccountSessionIsRefused(t *testing.T) {
	e := newEnv(t)
	carol := testutil.NewAccount(t, e.db)
	tok, _ := e.sess.Issue(carol.ID, 1, false)
	c := &who{Account: carol, token: tok}
	if w := e.do(req{method: "GET", path: "/auth/me", as: c}); w.Code != http.StatusOK {
		t.Fatalf("control: %d %s", w.Code, w.Body)
	}
	w := e.do(req{method: "POST", path: "/admin/users/" + carol.ID + "/deactivate", as: &e.admin, csrf: true})
	if w.Code >= 300 {
		t.Fatalf("deactivate: %d %s", w.Code, w.Body)
	}
	if w := e.do(req{method: "GET", path: "/auth/me", as: c}); w.Code != http.StatusUnauthorized {
		t.Fatalf("deactivated account still signed in: %d %s", w.Code, w.Body)
	}
}

// A report job of another account, or any account for an admin, is a 404.
func TestReportDownloadIsOwnerOnly(t *testing.T) {
	e := newEnv(t)
	f := e.newFixture(t)
	for name, c := range map[string]*who{"other user": &e.bob, "admin": &e.admin} {
		w := e.do(req{method: "GET", path: "/reports/" + f.jobID + "/download", as: c})
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404: %s", name, w.Code, w.Body)
		}
	}
}
