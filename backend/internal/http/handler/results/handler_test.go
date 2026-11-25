package results_test

import (
	"context"
	"encoding/json"
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
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/results"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/results"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	owner   = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	project = uuid.MustParse("33333333-3333-4333-8333-333333333333")
	latest  = uuid.MustParse("44444444-4444-4444-8444-444444444444")
	old     = uuid.MustParse("55555555-5555-4555-8555-555555555555")
	at      = time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
)

// fake holds a latest and an older submitted version of one owned project;
// EC-HS-2 is H, EC-MG-1 is L.
type fake struct{}

func (fake) Get(_ context.Context, p, v, o uuid.UUID) (svc.Results, error) {
	if p != project || o != owner || (v != latest && v != old) {
		return svc.Results{}, svc.ErrNotFound
	}
	strategy := "REDUCE"
	return svc.Results{
		VersionID: v, SubmittedAt: at, Editable: v == latest, AverageRM: 3.2,
		LevelCounts: map[string]int{"L": 1, "H": 1},
		FactorAverages: []svc.FactorAverage{
			{FactorCode: "EC-MG", ScoredCount: 1, AverageRM: 2},
			{FactorCode: "EC-HS", ScoredCount: 1, AverageRM: 3.5},
		},
		Items: []svc.Indicator{
			{Code: "EC-MG-1", X: 2, Y1Pct: 1.5, Y2Pct: 3, RL: 2, RIC: 2, RIT: 2, RIE: 2, RIMax: 2, RM: 2, Level: "L"},
			{
				Code: "EC-HS-2", X: 5, Y1Pct: 12, Y2Pct: 10, RL: 3, RIC: 4, RIT: 4, RIE: 3, RIMax: 4, RM: 3.5, Level: "H",
				Advice:   []svc.Advice{{List: "RL", Items: []string{"th one", "two", "three", "four", "five"}}},
				Strategy: &strategy, StrategyUpdatedAt: &at,
			},
		},
	}, nil
}

func (fake) SetStrategy(_ context.Context, p, v, o uuid.UUID, code, strategy string) (svc.Choice, error) {
	switch {
	case p != project || o != owner || (v != latest && v != old):
		return svc.Choice{}, svc.ErrNotFound
	case v == old:
		return svc.Choice{}, svc.ErrNotLatest
	case code == "EC-MG-1":
		return svc.Choice{}, svc.ErrNotHighRisk
	case strategy == "IGNORE":
		return svc.Choice{}, svc.ErrInvalidStrategy
	}
	return svc.Choice{IndicatorCode: code, Strategy: strategy, UpdatedAt: at}, nil
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

// spec loads the root contract with the results paths added, the way
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
		"  /projects/{project_id}/versions/{version_id}/results:\n"+
		"    $ref: paths/results.yaml#/~1projects~1{project_id}~1versions~1{version_id}~1results\n"+
		"  /projects/{project_id}/versions/{version_id}/results/{indicator_code}/strategy:\n"+
		"    $ref: paths/results.yaml#/~1projects~1{project_id}~1versions~1{version_id}~1results~1{indicator_code}~1strategy\n", 1)
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
func call(t *testing.T, accountID, method, path, body string) (*http.Response, string) {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/projects", func(r chi.Router) { results.Mount(r, fake{}, middleware.Session(ss)) })

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
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp, rec.Body.String()
}

func TestResultsEndpointsMatchContract(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/"
	put := func(v uuid.UUID, code string) string { return base + v.String() + "/results/" + code + "/strategy" }
	tests := []struct {
		name, method, path, body string
		want                     int
	}{
		{"get latest", http.MethodGet, base + latest.String() + "/results", "", http.StatusOK},
		{"get old", http.MethodGet, base + old.String() + "/results", "", http.StatusOK},
		{"get unknown version", http.MethodGet, base + uuid.NewString() + "/results", "", http.StatusNotFound},
		{"get bad id", http.MethodGet, base + "nope/results", "", http.StatusNotFound},
		{"set strategy", http.MethodPut, put(latest, "EC-HS-2"), `{"strategy":"TRANSFER"}`, http.StatusOK},
		{"strategy on L", http.MethodPut, put(latest, "EC-MG-1"), `{"strategy":"REDUCE"}`, http.StatusUnprocessableEntity},
		{"strategy on old version", http.MethodPut, put(old, "EC-HS-2"), `{"strategy":"REDUCE"}`, http.StatusConflict},
		{"unknown strategy", http.MethodPut, put(latest, "EC-HS-2"), `{"strategy":"IGNORE"}`, http.StatusUnprocessableEntity},
		{"bad body", http.MethodPut, put(latest, "EC-HS-2"), `{"strategy":`, http.StatusBadRequest},
		{"unknown version strategy", http.MethodPut, put(uuid.New(), "EC-HS-2"), `{"strategy":"REDUCE"}`, http.StatusNotFound},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got, _ := call(t, owner.String(), tc.method, tc.path, tc.body); got.StatusCode != tc.want {
				t.Fatalf("status = %d, want %d", got.StatusCode, tc.want)
			}
		})
	}
}

func TestNotHighRiskCodeAndLatestFlag(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/"
	_, body := call(t, owner.String(), http.MethodPut, base+latest.String()+"/results/EC-MG-1/strategy", `{"strategy":"REDUCE"}`)
	if !strings.Contains(body, `"not_high_risk"`) {
		t.Fatalf("body = %s", body)
	}
	_, body = call(t, owner.String(), http.MethodGet, base+old.String()+"/results?locale=en", "")
	if !strings.Contains(body, `"editable":false`) || !strings.Contains(body, "th one") || !strings.Contains(body, `"VH":0`) {
		t.Fatalf("body = %s", body)
	}
}

func TestFactorAveragesAreServedInOrder(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/"
	_, body := call(t, owner.String(), http.MethodGet, base+latest.String()+"/results", "")
	var got struct {
		FactorAverages []struct {
			FactorCode  string  `json:"factor_code"`
			ScoredCount int     `json:"scored_count"`
			AverageRM   float64 `json:"average_rm"`
		} `json:"factor_averages"`
	}
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.FactorAverages) != 2 || got.FactorAverages[0].FactorCode != "EC-MG" || got.FactorAverages[0].AverageRM != 2 ||
		got.FactorAverages[1].FactorCode != "EC-HS" || got.FactorAverages[1].AverageRM != 3.5 || got.FactorAverages[1].ScoredCount != 1 {
		t.Fatalf("factor_averages = %+v", got.FactorAverages)
	}
}

func TestOtherAccountGets404(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/" + latest.String() + "/results"
	if resp, _ := call(t, uuid.NewString(), http.MethodGet, base, ""); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("get: status = %d, want 404", resp.StatusCode)
	}
	resp, _ := call(t, uuid.NewString(), http.MethodPut, base+"/EC-HS-2/strategy", `{"strategy":"REDUCE"}`)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("put: status = %d, want 404", resp.StatusCode)
	}
}

func TestWithoutSession401(t *testing.T) {
	base := "/api/v1/projects/" + project.String() + "/versions/" + latest.String() + "/results"
	if resp, _ := call(t, "", http.MethodGet, base, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
