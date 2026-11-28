package jobs_test

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
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var owner = uuid.MustParse("11111111-1111-4111-8111-111111111111")

const adminID = "22222222-2222-4222-8222-222222222222"

// fakeJobs holds one job owned by owner.
type fakeJobs struct{}

func (fakeJobs) GetForRequester(_ context.Context, id, requester uuid.UUID) (svc.Job, error) {
	if requester != owner {
		return svc.Job{}, svc.ErrNotFound
	}
	now := time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC)
	return svc.Job{
		ID: id, Kind: svc.KindReport, RequestedBy: requester, Status: svc.StatusRunning,
		CreatedAt: now, StartedAt: &now,
	}, nil
}

// accounts is the session Store: every account is an active user, except
// the admin.
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

// noCache is a StateStore that never hits.
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

// jobSpec loads the root contract with the /jobs/{id} path added, the way
// contracts/bundle.mjs does, without needing node.
func jobSpec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root) //nolint:gosec // G304: test reads its own fixture file
	if err != nil {
		t.Fatal(err)
	}
	merged := strings.Replace(string(data), "paths: {}", "paths:\n  /jobs/{id}:\n    $ref: paths/jobs.yaml#/~1jobs~1{id}", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	spec, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return spec
}

// get calls GET path as accountID ("" for no session) and checks the response
// against the OpenAPI contract.
func get(t *testing.T, accountID, path string) *http.Response {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/jobs", func(r chi.Router) { jobs.Mount(r, fakeJobs{}, middleware.Session(ss)) })

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })

	if err := contract.Validate(jobSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp
}

func TestGetJobRequester(t *testing.T) {
	resp := get(t, owner.String(), "/api/v1/jobs/"+uuid.NewString())
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestGetJobOtherAccountAndAdminGet404(t *testing.T) {
	for _, caller := range []string{uuid.NewString(), adminID} {
		resp := get(t, caller, "/api/v1/jobs/"+uuid.NewString())
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("caller %s: status = %d, want 404", caller, resp.StatusCode)
		}
	}
}

func TestGetJobNotAUUIDIs404(t *testing.T) {
	// The contract declares a Uuid path parameter; the handler must not 500.
	ss, _ := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	r := chi.NewRouter()
	r.Route("/jobs", func(r chi.Router) { jobs.Mount(r, fakeJobs{}, middleware.Session(ss)) })
	token, _ := ss.Issue(owner.String(), 1, false)
	req := httptest.NewRequest(http.MethodGet, "/jobs/nope", nil)
	req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestGetJobWithoutSession401(t *testing.T) {
	resp := get(t, "", "/api/v1/jobs/"+uuid.NewString())
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
