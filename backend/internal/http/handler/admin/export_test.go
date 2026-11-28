package admin_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	adminsvc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/export"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	jobDone    = uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	jobExpired = uuid.MustParse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	jobQueued  = uuid.MustParse("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
	jobMissing = uuid.MustParse("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
)

type fakeExport struct {
	requested []svc.Params
	downloads int
}

func (f *fakeExport) Request(_ context.Context, _ uuid.UUID, p svc.Params) (uuid.UUID, error) {
	if p.Scope == svc.ScopeSelected && len(p.UserIDs) == 0 {
		return uuid.Nil, adminsvc.ValidationError{{Field: "/user_ids", Code: svc.CodeRequired}}
	}
	f.requested = append(f.requested, p)
	return jobDone, nil
}

func (f *fakeExport) Download(_ context.Context, id uuid.UUID) (svc.File, error) {
	switch id {
	case jobDone:
		f.downloads++
		return svc.File{Body: io.NopCloser(strings.NewReader("zip-bytes")), Disposition: `attachment; filename="export.zip"`}, nil
	case jobExpired:
		return svc.File{}, svc.ErrExpired
	case jobQueued:
		return svc.File{}, svc.ErrNotReady
	case jobMissing:
		return svc.File{}, svc.ErrFileMissing
	}
	return svc.File{}, svc.ErrNotFound
}

// exportSpec loads the root contract with the export paths added, the way
// contracts/bundle.mjs does, without needing node.
func exportSpec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root) //nolint:gosec // G304: test reads its own fixture file
	if err != nil {
		t.Fatal(err)
	}
	const f = "paths/admin-exports.yaml#/"
	merged := strings.Replace(string(data), "paths: {}", "paths:\n"+
		"  /admin/exports:\n    $ref: "+f+"~1admin~1exports\n"+
		"  /admin/exports/{job_id}/download:\n    $ref: "+f+"~1admin~1exports~1{job_id}~1download\n", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	s, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return s
}

func callExport(t *testing.T, f *fakeExport, accountID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		admin.MountExport(r, f, middleware.Session(ss), middleware.RequireRole(session.RoleAdmin))
	})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(exportSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v\nbody: %s", err, rec.Body.String())
	}
	return rec
}

func TestExportRequestAccepted(t *testing.T) {
	f := &fakeExport{}
	body := `{"scope":"selected","user_ids":["` + userID + `"],"include_deleted":true}`
	rec := callExport(t, f, adminID, http.MethodPost, base+"/exports", body)
	if rec.Code != http.StatusAccepted || !strings.Contains(rec.Body.String(), jobDone.String()) {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if len(f.requested) != 1 || f.requested[0].Scope != svc.ScopeSelected || !f.requested[0].IncludeDeleted ||
		len(f.requested[0].UserIDs) != 1 {
		t.Fatalf("service got %+v", f.requested)
	}
}

func TestExportRequestAllScope(t *testing.T) {
	rec := callExport(t, &fakeExport{}, adminID, http.MethodPost, base+"/exports", `{"scope":"all","include_deleted":false}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestExportRequestErrors(t *testing.T) {
	for name, tc := range map[string]struct {
		account, body string
		want          int
	}{
		"bad json":   {adminID, `{`, http.StatusBadRequest},
		"validation": {adminID, `{"scope":"selected","include_deleted":false}`, http.StatusUnprocessableEntity},
		"no session": {"", `{"scope":"all","include_deleted":false}`, http.StatusUnauthorized},
		"not admin":  {userID, `{"scope":"all","include_deleted":false}`, http.StatusForbidden},
	} {
		t.Run(name, func(t *testing.T) {
			f := &fakeExport{}
			if rec := callExport(t, f, tc.account, http.MethodPost, base+"/exports", tc.body); rec.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if len(f.requested) != 0 {
				t.Fatal("a rejected request reached the service")
			}
		})
	}
}

func TestExportDownloadStreamsZip(t *testing.T) {
	f := &fakeExport{}
	rec := callExport(t, f, adminID, http.MethodGet, base+"/exports/"+jobDone.String()+"/download", "")
	if rec.Code != http.StatusOK || rec.Body.String() != "zip-bytes" {
		t.Fatalf("status = %d body %q", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/zip" {
		t.Fatalf("content type = %q", ct)
	}
}

func TestExportDownloadStatuses(t *testing.T) {
	for name, tc := range map[string]struct {
		account string
		id      uuid.UUID
		want    int
	}{
		"expired is 410":    {adminID, jobExpired, http.StatusGone},
		"not ready is 409":  {adminID, jobQueued, http.StatusConflict},
		"file missing 409":  {adminID, jobMissing, http.StatusConflict},
		"unknown is 404":    {adminID, uuid.New(), http.StatusNotFound},
		"no session is 401": {"", jobDone, http.StatusUnauthorized},
		"user is 403":       {userID, jobDone, http.StatusForbidden},
	} {
		t.Run(name, func(t *testing.T) {
			f := &fakeExport{}
			rec := callExport(t, f, tc.account, http.MethodGet, base+"/exports/"+tc.id.String()+"/download", "")
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if f.downloads != 0 {
				t.Fatal("a refused download reached the service")
			}
		})
	}
}
