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
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
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

var now = time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC)

// fakeSvc validates with the real rules and stores in memory.
type fakeSvc struct {
	rl svc.RLThreshold
}

func newFake() *fakeSvc {
	return &fakeSvc{
		rl: svc.RLThreshold{
			IndicatorCode: "EC-HS-1", Unit: "ครั้ง", Direction: engine.DirectionNormal, UpdatedAt: now,
			Values: svc.Values{A: engine.F(1), B: engine.F(2), C: engine.F(3), D: engine.F(4), E: engine.F(5)},
		},
	}
}

func (f *fakeSvc) ListRL(context.Context) ([]svc.RLThreshold, error) {
	return []svc.RLThreshold{f.rl}, nil
}

func (f *fakeSvc) GetRL(_ context.Context, code string) (svc.RLThreshold, error) {
	if code != f.rl.IndicatorCode {
		return svc.RLThreshold{}, svc.ErrIndicatorNotFound
	}
	return f.rl, nil
}

func (f *fakeSvc) UpdateRL(_ context.Context, _ uuid.UUID, code string, v svc.Values) (svc.RLThreshold, error) {
	if code != f.rl.IndicatorCode {
		return svc.RLThreshold{}, svc.ErrIndicatorNotFound
	}
	if err := svc.ValidateRL(f.rl.Direction, v); err != nil {
		return svc.RLThreshold{}, err
	}
	f.rl.Values = v
	return f.rl, nil
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

// spec loads the root contract with the threshold paths added, the way
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
	const f = "paths/admin-thresholds.yaml#/"
	merged := strings.Replace(string(data), "paths: {}", "paths:\n"+
		"  /admin/rl-thresholds:\n    $ref: "+f+"~1admin~1rl-thresholds\n"+
		"  /admin/rl-thresholds/{indicator_code}:\n    $ref: "+f+"~1admin~1rl-thresholds~1{indicator_code}\n", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	s, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return s
}

// call sends method path with body as accountID ("" for no session) and
// checks the response against the OpenAPI contract.
func call(t *testing.T, f *fakeSvc, accountID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		admin.MountThresholds(r, f, middleware.Session(ss), middleware.RequireRole(session.RoleAdmin))
	})
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
	if err := contract.Validate(spec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v\nbody: %s", err, rec.Body.String())
	}
	return rec
}

const base = "/api/v1/admin"

func TestReadsMatchContract(t *testing.T) {
	for _, p := range []string{"/rl-thresholds", "/rl-thresholds/EC-HS-1"} {
		if rec := call(t, newFake(), adminID, http.MethodGet, base+p, ""); rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", p, rec.Code)
		}
	}
}

func TestUpdateRLAcceptsAllValidPatterns(t *testing.T) {
	for name, body := range map[string]string{
		"all five": `{"thresholds":{"a":0.1,"b":2,"c":3,"d":4,"e":5}}`,
		"a-c only": `{"thresholds":{"a":1,"b":2,"c":3,"d":null,"e":null}}`,
		"c-e only": `{"thresholds":{"a":null,"b":null,"c":3,"d":4,"e":5}}`,
	} {
		t.Run(name, func(t *testing.T) {
			f := newFake()
			rec := call(t, f, adminID, http.MethodPut, base+"/rl-thresholds/EC-HS-1", body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestUpdateRLKeepsDecimals(t *testing.T) {
	f := newFake()
	call(t, f, adminID, http.MethodPut, base+"/rl-thresholds/EC-HS-1", `{"thresholds":{"a":0.1,"b":2,"c":3,"d":4,"e":5}}`)
	if got := *f.rl.Values.A; got != 0.1 {
		t.Fatalf("a = %v, want exactly 0.1", got)
	}
}

func TestUpdateRLInvalidIs422WithFields(t *testing.T) {
	for name, tc := range map[string]struct{ body, field, code string }{
		"pattern": {`{"thresholds":{"a":1,"b":2,"c":null,"d":4,"e":5}}`, "/thresholds", "invalid_pattern"},
		"order":   {`{"thresholds":{"a":5,"b":4,"c":3,"d":2,"e":1}}`, "/thresholds", "invalid_order"},
		"equal":   {`{"thresholds":{"a":1,"b":1,"c":3,"d":4,"e":5}}`, "/thresholds", "invalid_order"},
		"negative": {
			`{"thresholds":{"a":-1,"b":2,"c":3,"d":4,"e":5}}`, "/thresholds/a", "negative",
		},
	} {
		t.Run(name, func(t *testing.T) {
			rec := call(t, newFake(), adminID, http.MethodPut, base+"/rl-thresholds/EC-HS-1", tc.body)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422", rec.Code)
			}
			if b := rec.Body.String(); !strings.Contains(b, tc.field) || !strings.Contains(b, tc.code) {
				t.Fatalf("body %s lacks field %s code %s", b, tc.field, tc.code)
			}
		})
	}
}

func TestUpdateRLUnknownIndicatorIs404(t *testing.T) {
	rec := call(t, newFake(), adminID, http.MethodPut, base+"/rl-thresholds/NOPE", `{"thresholds":{"a":1,"b":2,"c":3,"d":4,"e":5}}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestNeedsAdmin(t *testing.T) {
	if rec := call(t, newFake(), "", http.MethodGet, base+"/rl-thresholds", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no session = %d, want 401", rec.Code)
	}
	if rec := call(t, newFake(), userID, http.MethodPut, base+"/rl-thresholds/EC-HS-1", `{}`); rec.Code != http.StatusForbidden {
		t.Fatalf("user = %d, want 403", rec.Code)
	}
}
