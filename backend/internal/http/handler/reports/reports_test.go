package reports_test

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
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	owner     = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	submitted = uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	draft     = uuid.MustParse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	doneJob   = uuid.MustParse("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
	queueJob  = uuid.MustParse("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
	lostJob   = uuid.MustParse("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
	oldJob    = uuid.MustParse("ffffffff-ffff-4fff-8fff-ffffffffffff")
)

const adminID = "22222222-2222-4222-8222-222222222222"

// fake knows one owner, one submitted and one draft version, and three jobs.
type fake struct{}

func (fake) Request(_ context.Context, requester, _, versionID uuid.UUID) (uuid.UUID, error) {
	switch {
	case requester != owner:
		return uuid.Nil, svc.ErrNotFound
	case versionID == draft:
		return uuid.Nil, svc.ErrNotSubmitted
	case versionID == submitted:
		return doneJob, nil
	}
	return uuid.Nil, svc.ErrNotFound // deleted or unknown
}

func (fake) Download(_ context.Context, requester, id uuid.UUID) (svc.File, error) {
	switch {
	case requester != owner:
		return svc.File{}, svc.ErrNotFound
	case id == doneJob:
		return svc.File{
			Body:        io.NopCloser(strings.NewReader("%PDF-1.7 test")),
			Disposition: `attachment; filename=report-TST1-v1.pdf`,
		}, nil
	case id == queueJob:
		return svc.File{}, svc.ErrNotReady
	case id == lostJob:
		return svc.File{}, svc.ErrFileMissing
	case id == oldJob:
		return svc.File{}, svc.ErrExpired
	}
	return svc.File{}, svc.ErrNotFound
}

type accounts struct{}

func (accounts) GetRecord(_ context.Context, id string) (session.Record, error) {
	role := session.RoleUser
	if id == adminID {
		role = session.RoleAdmin
	}
	return session.Record{Role: role, Status: session.StatusActive, Version: 1}, nil
}
func (accounts) BumpVersion(context.Context, string) (int, error) { return 2, nil }
func (accounts) GetProfile(context.Context, string) (session.Profile, error) {
	return session.Profile{}, nil
}

type noCache struct{}

func (noCache) Set(context.Context, string, []byte, time.Duration) error { return nil }
func (noCache) Get(context.Context, string) ([]byte, error)              { return nil, valkey.ErrNotFound }
func (noCache) Del(context.Context, ...string) error                     { return nil }
func (noCache) Incr(context.Context, string, time.Duration) (int64, error) {
	return 0, nil
}

func (noCache) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return false, nil
}

// reportSpec loads the root contract with the two report paths added, the
// way contracts/bundle.mjs does, without needing node.
func reportSpec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root)
	if err != nil {
		t.Fatal(err)
	}
	paths := "paths:\n" +
		"  /projects/{project_id}/versions/{version_id}/reports:\n" +
		"    $ref: paths/reports.yaml#/~1projects~1{project_id}~1versions~1{version_id}~1reports\n" +
		"  /reports/{job_id}/download:\n" +
		"    $ref: paths/reports.yaml#/~1reports~1{job_id}~1download"
	merged := strings.Replace(string(data), "paths: {}", paths, 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	spec, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return spec
}

// call sends method path as accountID ("" for no session) and checks the
// response against the OpenAPI contract.
func call(t *testing.T, accountID, method, path string) (*http.Response, string) {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	auth := middleware.Session(ss)
	r := chi.NewRouter()
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/reports", func(r chi.Router) { reports.Mount(r, fake{}, auth) })
		r.With(auth).Post("/projects/{project_id}/versions/{version_id}/reports", reports.Request(fake{}))
	})
	req := httptest.NewRequest(method, path, nil)
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(reportSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

func requestPath(version uuid.UUID) string {
	return "/api/v1/projects/" + uuid.NewString() + "/versions/" + version.String() + "/reports"
}

func TestRequestAccepted202(t *testing.T) {
	resp, body := call(t, owner.String(), http.MethodPost, requestPath(submitted))
	if resp.StatusCode != http.StatusAccepted || !strings.Contains(body, doneJob.String()) {
		t.Fatalf("status = %d body = %s, want 202 with the job id", resp.StatusCode, body)
	}
}

func TestRequestDraftVersion409(t *testing.T) {
	resp, _ := call(t, owner.String(), http.MethodPost, requestPath(draft))
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
}

func TestRequestDeletedOrForeignVersion404(t *testing.T) {
	for name, tc := range map[string]struct{ caller, path string }{
		"deleted": {owner.String(), requestPath(uuid.New())},
		"other":   {uuid.NewString(), requestPath(submitted)},
		"admin":   {adminID, requestPath(submitted)},
	} {
		resp, _ := call(t, tc.caller, http.MethodPost, tc.path)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: status = %d, want 404", name, resp.StatusCode)
		}
	}
}

func TestRequestWithoutSession401(t *testing.T) {
	resp, _ := call(t, "", http.MethodPost, requestPath(submitted))
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestDownloadStreamsPDF(t *testing.T) {
	resp, body := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download")
	if resp.StatusCode != http.StatusOK || body != "%PDF-1.7 test" {
		t.Fatalf("status = %d body = %q", resp.StatusCode, body)
	}
	if got := resp.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") {
		t.Fatalf("Content-Disposition = %q", got)
	}
	if got := resp.Header.Get("Content-Type"); got != "application/pdf" {
		t.Fatalf("Content-Type = %q", got)
	}
}

func TestDownloadDispositionInline(t *testing.T) {
	resp, body := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download?disposition=inline")
	if resp.StatusCode != http.StatusOK || body != "%PDF-1.7 test" {
		t.Fatalf("status = %d body = %q", resp.StatusCode, body)
	}
	if got := resp.Header.Get("Content-Disposition"); got != "inline; filename=report-TST1-v1.pdf" {
		t.Fatalf("Content-Disposition = %q", got)
	}
}

func TestDownloadDispositionAttachmentExplicit(t *testing.T) {
	resp, _ := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download?disposition=attachment")
	if got := resp.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") {
		t.Fatalf("Content-Disposition = %q", got)
	}
}

func TestDownloadInvalidDisposition400(t *testing.T) {
	resp, _ := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download?disposition=bogus")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestDownloadInlineOtherAccount404(t *testing.T) {
	resp, _ := call(t, uuid.NewString(), http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download?disposition=inline")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestDownloadConflicts(t *testing.T) {
	for _, id := range []uuid.UUID{queueJob, lostJob} {
		resp, _ := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+id.String()+"/download")
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("job %s: status = %d, want 409", id, resp.StatusCode)
		}
	}
}

func TestDownloadReplacedReportIsConflictWithOwnCode(t *testing.T) {
	resp, body := call(t, owner.String(), http.MethodGet, "/api/v1/reports/"+oldJob.String()+"/download")
	if resp.StatusCode != http.StatusConflict || !strings.Contains(string(body), "report_expired") {
		t.Fatalf("status = %d body = %s, want 409 report_expired", resp.StatusCode, body)
	}
}

func TestDownloadOtherAccountAdminAndUnknown404(t *testing.T) {
	for _, tc := range []struct {
		caller string
		job    uuid.UUID
	}{{uuid.NewString(), doneJob}, {adminID, doneJob}, {owner.String(), uuid.New()}} {
		resp, _ := call(t, tc.caller, http.MethodGet, "/api/v1/reports/"+tc.job.String()+"/download")
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("caller %s: status = %d, want 404", tc.caller, resp.StatusCode)
		}
	}
}

func TestDownloadWithoutSession401(t *testing.T) {
	resp, _ := call(t, "", http.MethodGet, "/api/v1/reports/"+doneJob.String()+"/download")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
