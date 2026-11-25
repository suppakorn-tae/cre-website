package securitytest

import (
	"net/http"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

// requiresSession reports whether every security alternative of the
// operation needs the session cookie.
func requiresSession(spec *openapi3.T, op *openapi3.Operation) bool {
	sec := spec.Security
	if op.Security != nil {
		sec = *op.Security
	}
	if len(sec) == 0 {
		return false
	}
	for _, alt := range sec {
		if _, ok := alt["sessionCookie"]; !ok {
			return false
		}
	}
	return true
}

// checkMountedPending runs the checks that need no fixtures on a route that
// is listed as pending but is now mounted: no session gives 401, and a
// mutation without CSRF token or with a foreign origin gives 403.
func (e *env) checkMountedPending(t *testing.T, key string) {
	t.Helper()
	method, want, _ := strings.Cut(key, " ")
	var op *openapi3.Operation
	var path string
	for p, item := range e.spec.Paths.Map() {
		if o := item.Operations()[method]; o != nil && norm(p) == want {
			op, path = o, p
		}
	}
	if op == nil {
		t.Errorf("%s: not in the contract", key)
		return
	}
	path = paramRe.ReplaceAllString(path, "0193a5c2-7b1e-4c3a-9d4f-2a6b8e1f5c70")
	as := &e.alice
	if strings.HasPrefix(path, "/admin") {
		as = &e.admin
	}
	if requiresSession(e.spec, op) {
		if w := e.do(req{method: method, path: path, csrf: true}); w.Code != http.StatusUnauthorized {
			t.Errorf("%s: no session: status %d, want 401: %s", key, w.Code, w.Body)
		}
	}
	if !unsafe(method) {
		return
	}
	if w := e.do(req{method: method, path: path, as: as}); w.Code != http.StatusForbidden {
		t.Errorf("%s: no CSRF token: status %d, want 403: %s", key, w.Code, w.Body)
	}
	if w := e.do(req{method: method, path: path, as: as, csrf: true, origin: "https://evil.example"}); w.Code != http.StatusForbidden {
		t.Errorf("%s: foreign origin: status %d, want 403: %s", key, w.Code, w.Body)
	}
}
