package assessments_test

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
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	owner   = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	project = uuid.MustParse("33333333-3333-4333-8333-333333333333")
	okID    = uuid.MustParse("44444444-4444-4444-8444-444444444444")
	oldID   = uuid.MustParse("55555555-5555-4555-8555-555555555555")
	emptyID = uuid.MustParse("66666666-6666-4666-8666-666666666666")
	at      = time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
)

type fake struct{}

func (fake) Submit(_ context.Context, o, p, v uuid.UUID) (svc.SubmitResult, error) {
	switch {
	case o != owner || p != project:
		return svc.SubmitResult{}, svc.ErrSubmitNotFound
	case v == okID:
		return svc.SubmitResult{
			SubmittedAt: at, Scored: 3, AverageRM: 3.412,
			LevelCounts: map[engine.RiskLevel]int{engine.LevelL: 1, engine.LevelH: 1, engine.LevelVH: 1},
		}, nil
	case v == oldID:
		return svc.SubmitResult{}, svc.ErrSubmitNotLatest
	case v == emptyID:
		return svc.SubmitResult{}, svc.ErrNoCompleteIndicator
	}
	return svc.SubmitResult{}, svc.ErrSubmitNotFound
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

// spec loads the root contract with the submit path added, the way
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
		"  /projects/{project_id}/versions/{version_id}/submit:\n"+
		"    $ref: paths/assessments.yaml#/~1projects~1{project_id}~1versions~1{version_id}~1submit\n", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	s, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return s
}

func call(t *testing.T, accountID, path string) *http.Response {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/projects", func(r chi.Router) { assessments.MountSubmit(r, fake{}, middleware.Session(ss)) })

	req := httptest.NewRequest(http.MethodPost, path, nil)
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

func TestSubmitMatchesContract(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/"
	tests := []struct {
		name, path string
		as         string
		want       int
	}{
		{"submitted", base + okID.String() + "/submit", owner.String(), http.StatusOK},
		{"not latest", base + oldID.String() + "/submit", owner.String(), http.StatusConflict},
		{"no complete indicator", base + emptyID.String() + "/submit", owner.String(), http.StatusUnprocessableEntity},
		{"unknown version", base + uuid.NewString() + "/submit", owner.String(), http.StatusNotFound},
		{"other account", base + okID.String() + "/submit", uuid.NewString(), http.StatusNotFound},
		{"malformed id", "/api/v1/projects/" + project.String() + "/versions/nope/submit", owner.String(), http.StatusNotFound},
		{"no session", base + okID.String() + "/submit", "", http.StatusUnauthorized},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := call(t, tc.as, tc.path).StatusCode; got != tc.want {
				t.Fatalf("status = %d, want %d", got, tc.want)
			}
		})
	}
}
