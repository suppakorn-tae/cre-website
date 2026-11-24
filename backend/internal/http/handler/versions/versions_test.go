package versions_test

import (
	"context"
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
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/versions"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	owner   = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	project = uuid.MustParse("33333333-3333-4333-8333-333333333333")
	oldID   = uuid.MustParse("44444444-4444-4444-8444-444444444444")
	newID   = uuid.MustParse("55555555-5555-4555-8555-555555555555")
	at      = time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC)
)

// fake holds one project (owned by owner) with a submitted v1 and a draft v2.
type fake struct{}

func (fake) versions() []svc.Version {
	one, two, four, avg := 12, 3, 80, 3.25
	return []svc.Version{
		{
			ID: newID, ProjectID: project, No: 2, Status: svc.StatusDraft, Editable: true,
			ValueBaht: 1e8, StartDate: at, EndDate: at.AddDate(1, 0, 0), CreatedAt: at,
		},
		{
			ID: oldID, ProjectID: project, No: 1, Status: svc.StatusSubmitted, SubmissionNo: 1,
			ValueBaht: 1e8, StartDate: at, EndDate: at.AddDate(1, 0, 0), CreatedAt: at, SubmittedAt: &at,
			ProgressAtSubmit: &four, HighCount: &one, VeryHighCount: &two, AverageRM: &avg,
		},
	}
}

func (f fake) Create(_ context.Context, p, o uuid.UUID) (svc.Version, error) {
	if p != project || o != owner {
		return svc.Version{}, svc.ErrNotFound
	}
	return f.versions()[0], nil
}

func (f fake) List(_ context.Context, p, o uuid.UUID) ([]svc.Version, error) {
	if p != project || o != owner {
		return nil, svc.ErrNotFound
	}
	return f.versions(), nil
}

func (f fake) Get(_ context.Context, p, id, o uuid.UUID) (svc.Version, error) {
	if p == project && o == owner {
		for _, v := range f.versions() {
			if v.ID == id {
				return v, nil
			}
		}
	}
	return svc.Version{}, svc.ErrNotFound
}

func (f fake) Delete(ctx context.Context, p, id, o uuid.UUID) error {
	_, err := f.Get(ctx, p, id, o)
	return err
}

type accounts struct{}

func (accounts) GetRecord(context.Context, string) (session.Record, error) {
	return session.Record{Role: session.RoleUser, Status: session.StatusActive, Version: 1}, nil
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

// spec loads the root contract with the version paths added, the way
// contracts/bundle.mjs does, without needing node.
func spec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root)
	if err != nil {
		t.Fatal(err)
	}
	merged := strings.Replace(string(data), "paths: {}", "paths:\n"+
		"  /projects/{project_id}/versions:\n    $ref: paths/versions.yaml#/~1projects~1{project_id}~1versions\n"+
		"  /projects/{project_id}/versions/{version_id}:\n    $ref: paths/versions.yaml#/~1projects~1{project_id}~1versions~1{version_id}\n", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	s, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return s
}

// call sends the request as accountID ("" for no session) and checks the
// response against the OpenAPI contract.
func call(t *testing.T, accountID, method, path string) *http.Response {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/projects", func(r chi.Router) { versions.Mount(r, fake{}, middleware.Session(ss)) })

	req := httptest.NewRequest(method, path, nil)
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(spec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp
}

func TestVersionEndpointsMatchContract(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions"
	tests := []struct {
		name, method, path string
		want               int
	}{
		{"list", http.MethodGet, base, http.StatusOK},
		{"create", http.MethodPost, base, http.StatusCreated},
		{"get draft", http.MethodGet, base + "/" + newID.String(), http.StatusOK},
		{"get submitted", http.MethodGet, base + "/" + oldID.String(), http.StatusOK},
		{"delete", http.MethodDelete, base + "/" + oldID.String(), http.StatusNoContent},
		{"unknown version", http.MethodGet, base + "/" + uuid.NewString(), http.StatusNotFound},
		{"unknown project", http.MethodGet, "/api/v1/projects/" + uuid.NewString() + "/versions", http.StatusNotFound},
		{"delete unknown", http.MethodDelete, base + "/" + uuid.NewString(), http.StatusNotFound},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := call(t, owner.String(), tc.method, tc.path).StatusCode; got != tc.want {
				t.Fatalf("status = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestOtherAccountGets404(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions"
	for _, m := range []string{http.MethodGet, http.MethodPost} {
		if got := call(t, uuid.NewString(), m, base).StatusCode; got != http.StatusNotFound {
			t.Fatalf("%s: status = %d, want 404", m, got)
		}
	}
}

func TestWithoutSession401(t *testing.T) {
	got := call(t, "", http.MethodGet, "/api/v1/projects/"+project.String()+"/versions").StatusCode
	if got != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", got)
	}
}
