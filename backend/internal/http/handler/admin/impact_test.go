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

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

// impactFake validates with the real rules and stores in memory.
type impactFake struct{ t svc.ImpactTables }

func newImpactFake() *impactFake {
	return &impactFake{t: svc.ImpactTables{
		RIC: svc.Impact{Code: "RI_C", Values: [5]float64{1, 2, 3, 4, 5}, UpdatedAt: now},
		RIT: svc.Impact{Code: "RI_T", Values: [5]float64{1, 2, 3, 4, 5}, UpdatedAt: now},
	}}
}

func (f *impactFake) Get(context.Context) (svc.ImpactTables, error) { return f.t, nil }

func (f *impactFake) Update(_ context.Context, _ uuid.UUID, e svc.ImpactEdit) (svc.ImpactTables, error) {
	var errs svc.ValidationError
	if e.RIC != nil {
		if err := svc.ValidateImpact("/ri_c", *e.RIC); err != nil {
			errs = append(errs, err.(svc.ValidationError)...)
		}
	}
	if e.RIT != nil {
		if err := svc.ValidateImpact("/ri_t", *e.RIT); err != nil {
			errs = append(errs, err.(svc.ValidationError)...)
		}
	}
	if len(errs) > 0 {
		return svc.ImpactTables{}, errs
	}
	if e.RIC != nil {
		f.t.RIC.Values = *e.RIC
	}
	if e.RIT != nil {
		f.t.RIT.Values = *e.RIT
	}
	return f.t, nil
}

func impactSpec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root) //nolint:gosec // G304: test reads its own fixture file
	if err != nil {
		t.Fatal(err)
	}
	merged := strings.Replace(string(data), "paths: {}",
		"paths:\n  /admin/impact-tables:\n    $ref: paths/admin-thresholds.yaml#/~1admin~1impact-tables\n", 1)
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	s, err := loader.LoadFromDataWithPath([]byte(merged), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return s
}

// impactCall sends the request as accountID ("" for no session) and checks
// the response against the OpenAPI contract.
func impactCall(t *testing.T, f *impactFake, accountID, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		admin.MountImpact(r, f, middleware.Session(ss), middleware.RequireRole(session.RoleAdmin))
	})
	req := httptest.NewRequest(method, "/api/v1/admin/impact-tables", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(impactSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v\nbody: %s", err, rec.Body.String())
	}
	return rec
}

func TestImpactGetMatchesContract(t *testing.T) {
	if rec := impactCall(t, newImpactFake(), adminID, http.MethodGet, ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestImpactUpdateOneOrBoth(t *testing.T) {
	for name, body := range map[string]string{
		"ri_c only": `{"ri_c":{"a":0,"b":2,"c":3,"d":4,"e":5}}`,
		"ri_t only": `{"ri_t":{"a":0.5,"b":2,"c":3,"d":4,"e":5}}`,
		"both":      `{"ri_c":{"a":1,"b":2,"c":3,"d":4,"e":5},"ri_t":{"a":10,"b":20,"c":30,"d":40,"e":50}}`,
	} {
		t.Run(name, func(t *testing.T) {
			if rec := impactCall(t, newImpactFake(), adminID, http.MethodPut, body); rec.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestImpactKeepsDecimals(t *testing.T) {
	f := newImpactFake()
	impactCall(t, f, adminID, http.MethodPut, `{"ri_t":{"a":0.1,"b":2,"c":3,"d":4,"e":5}}`)
	if got := f.t.RIT.Values[0]; got != 0.1 {
		t.Fatalf("a = %v, want exactly 0.1", got)
	}
}

func TestImpactInvalidIs422WithFields(t *testing.T) {
	for name, tc := range map[string]struct{ body, field, code string }{
		"order":    {`{"ri_c":{"a":0,"b":2,"c":2,"d":4,"e":5}}`, "/ri_c", "invalid_order"},
		"reversed": {`{"ri_t":{"a":5,"b":4,"c":3,"d":2,"e":1}}`, "/ri_t", "invalid_order"},
		"negative": {`{"ri_t":{"a":-1,"b":2,"c":3,"d":4,"e":5}}`, "/ri_t/a", "negative"},
	} {
		t.Run(name, func(t *testing.T) {
			rec := impactCall(t, newImpactFake(), adminID, http.MethodPut, tc.body)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422", rec.Code)
			}
			if b := rec.Body.String(); !strings.Contains(b, tc.field) || !strings.Contains(b, tc.code) {
				t.Fatalf("body %s lacks field %s code %s", b, tc.field, tc.code)
			}
		})
	}
}

func TestImpactEmptyBodyIs400(t *testing.T) {
	if rec := impactCall(t, newImpactFake(), adminID, http.MethodPut, `{}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestImpactNeedsAdmin(t *testing.T) {
	if rec := impactCall(t, newImpactFake(), "", http.MethodGet, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no session = %d, want 401", rec.Code)
	}
	if rec := impactCall(t, newImpactFake(), userID, http.MethodPut, `{}`); rec.Code != http.StatusForbidden {
		t.Fatalf("user = %d, want 403", rec.Code)
	}
}
