package admin_test

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
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const (
	adminID = "22222222-2222-4222-8222-222222222222"
	userID  = "11111111-1111-4111-8111-111111111111"
)

// fakeAdvice validates like the real service and stores nothing.
type fakeAdvice struct{ replaced []svc.AdviceItem }

func (f *fakeAdvice) Get(_ context.Context, code string) (svc.AdviceSet, error) {
	if code != "EC-HS-2" {
		return svc.AdviceSet{}, svc.ErrNotFound
	}
	item := svc.AdviceItem{Text: map[string]string{"th": "ข้อ 1"}}
	set := svc.AdviceSet{IndicatorCode: code, UpdatedAt: time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC), Lists: map[string][]svc.AdviceItem{}}
	for _, l := range svc.AdviceLists {
		set.Lists[l] = []svc.AdviceItem{item}
	}
	return set, nil
}

func (f *fakeAdvice) Replace(_ context.Context, _ uuid.UUID, code, list string, items []svc.AdviceItem) (svc.AdviceList, error) {
	if err := svc.Validate(items); err != nil {
		return svc.AdviceList{}, err
	}
	if code != "EC-HS-2" {
		return svc.AdviceList{}, svc.ErrNotFound
	}
	f.replaced = items
	return svc.AdviceList{IndicatorCode: code, List: list, Items: items, UpdatedAt: time.Date(2026, 11, 24, 9, 0, 0, 0, time.UTC)}, nil
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

// adviceSpec loads the root contract with the advice paths added, the way
// contracts/bundle.mjs does, without needing node.
func adviceSpec(t *testing.T) *openapi3.T {
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
		"  /admin/advice/{indicator_code}:\n    $ref: paths/admin-advice.yaml#/~1admin~1advice~1{indicator_code}\n" +
		"  /admin/advice/{indicator_code}/{list}:\n    $ref: paths/admin-advice.yaml#/~1admin~1advice~1{indicator_code}~1{list}"
	merged := strings.Replace(string(data), "paths: {}", paths, 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	spec, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return spec
}

// call sends method path with body as accountID ("" for no session) and
// checks the response against the OpenAPI contract.
func call(t *testing.T, f *fakeAdvice, accountID, method, path, body string) *http.Response {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.With(middleware.Session(ss), middleware.RequireRole(session.RoleAdmin)).
		Route("/api/v1/admin", func(r chi.Router) { admin.MountAdvice(r, f) })

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(adviceSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp
}

const base = "/api/v1/admin/advice/EC-HS-2"

func TestGetAdvice(t *testing.T) {
	if resp := call(t, &fakeAdvice{}, adminID, http.MethodGet, base, ""); resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if resp := call(t, &fakeAdvice{}, adminID, http.MethodGet, "/api/v1/admin/advice/NOPE", ""); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestAdviceNeedsAdmin(t *testing.T) {
	if resp := call(t, &fakeAdvice{}, "", http.MethodGet, base, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no session: status = %d, want 401", resp.StatusCode)
	}
	if resp := call(t, &fakeAdvice{}, userID, http.MethodGet, base, ""); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("user: status = %d, want 403", resp.StatusCode)
	}
}

func TestReplaceAdvice(t *testing.T) {
	items := func(n int, th string) string {
		parts := make([]string, n)
		for i := range parts {
			parts[i] = `{"text":{"th":"` + th + `"}}`
		}
		return `{"items":[` + strings.Join(parts, ",") + `]}`
	}
	tests := []struct {
		name, path, body string
		want             int
	}{
		{"one item", base + "/RL", items(1, "ก"), 200},
		{"reorder three", base + "/RI_C", `{"items":[{"text":{"th":"ค"}},{"text":{"th":"ก"}},{"text":{"th":"ข","en":"b"}}]}`, 200},
		{"five items", base + "/RI_T", items(5, "ก"), 200},
		{"zero items", base + "/RL", `{"items":[]}`, 422},
		{"missing items", base + "/RL", `{}`, 422},
		{"six items", base + "/RL", items(6, "ก"), 422},
		{"blank th", base + "/RL", items(2, "  "), 422},
		{"no th", base + "/RL", `{"items":[{"text":{"en":"x"}}]}`, 422},
		{"bad json", base + "/RL", `{"items":`, 400},
		{"bad list", base + "/XX", items(1, "ก"), 400},
		{"unknown indicator", "/api/v1/admin/advice/NOPE/RL", items(1, "ก"), 404},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if resp := call(t, &fakeAdvice{}, adminID, http.MethodPut, tc.path, tc.body); resp.StatusCode != tc.want {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tc.want)
			}
		})
	}
}

func TestReplaceKeepsOrder(t *testing.T) {
	f := &fakeAdvice{}
	call(t, f, adminID, http.MethodPut, base+"/RI_C", `{"items":[{"text":{"th":"ค"}},{"text":{"th":"ก"}},{"text":{"th":"ข"}}]}`)
	var got []string
	for _, it := range f.replaced {
		got = append(got, it.Text["th"])
	}
	if strings.Join(got, "") != "คกข" {
		t.Fatalf("order = %v", got)
	}
}
