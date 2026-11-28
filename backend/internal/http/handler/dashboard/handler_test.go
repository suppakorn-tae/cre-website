package dashboard_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/dashboard"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/dashboard"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var owner = uuid.MustParse("11111111-1111-4111-8111-111111111111")

const adminID = "22222222-2222-4222-8222-222222222222"

// fakeReader serves figures for owner only and records who asked.
type fakeReader struct{ asked []uuid.UUID }

func (f *fakeReader) Summary(_ context.Context, o uuid.UUID) (svc.Summary, error) {
	f.asked = append(f.asked, o)
	return svc.Summary{
		Kpis:   svc.Kpis{ProjectCount: 2, VersionCount: 5, HVhIndicatorCount: 7, IslandCount: 1, TotalValueBaht: "250000000.50"},
		Levels: svc.LevelCounts{VL: 1, L: 2, M: 3, H: 4, VH: 3},
		ProjectRisks: []svc.ProjectRisk{
			{ProjectID: uuid.New(), Name: "Pier", Nickname: "PIER", VersionID: uuid.New(), VersionNo: 2, HCount: 4, VhCount: 3},
		},
	}, nil
}

func (f *fakeReader) Projects(_ context.Context, o uuid.UUID, _ svc.ProjectsParams) (svc.ProjectsPage, error) {
	f.asked = append(f.asked, o)
	sub, n, rm, other := uuid.New(), 7, "3.25", "dock"
	return svc.ProjectsPage{Total: 2, Items: []svc.ProjectItem{
		{
			ProjectID: uuid.New(), Name: "Pier", Nickname: "PIER", IslandCode: "koh_tao", TypeCode: "pier",
			TypeOther: &other, ValueBaht: "150000000.25", ProgressPct: 40, VersionCount: 3,
			LatestVersionID: uuid.New(), LatestVersionNo: 3, LatestVersionStatus: "draft",
			LatestVersionScored: 55, LatestVersionTotal: 55,
			LatestSubmittedVersionID: &sub, HVhCount: &n, AvgRM: &rm,
		},
		{
			ProjectID: uuid.New(), Name: "New", Nickname: "NEW1", IslandCode: "koh_samui", TypeCode: "road",
			ValueBaht: "1.00", VersionCount: 1, LatestVersionID: uuid.New(), LatestVersionNo: 1, LatestVersionStatus: "draft",
			LatestVersionTotal: 55,
		},
	}}, nil
}

func (f *fakeReader) TopIndicators(_ context.Context, o uuid.UUID) ([]svc.TopIndicator, error) {
	f.asked = append(f.asked, o)
	return []svc.TopIndicator{{
		Rank: 1, IndicatorCode: "EC-HS-1", FactorCode: "EC-HS", HCount: 1, VhCount: 1, FoundIn: 2,
		Projects: []svc.TopProject{{ID: uuid.New(), Nickname: "ALPH"}, {ID: uuid.New(), Nickname: "BETA"}},
	}}, nil
}

func (f *fakeReader) Islands(_ context.Context, o uuid.UUID) ([]svc.IslandGroup, error) {
	f.asked = append(f.asked, o)
	n := 3
	return []svc.IslandGroup{{IslandCode: "koh_tao", Projects: []svc.IslandProject{
		{ProjectID: uuid.New(), Name: "Pier", Nickname: "PIER", ProgressPct: 10, LatestVersionID: uuid.New(), HVhCount: &n},
		{ProjectID: uuid.New(), Name: "New", Nickname: "NEW1", LatestVersionID: uuid.New()},
	}}}, nil
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

// get calls GET path as accountID ("" for no session) and checks the response
// against the OpenAPI contract.
func get(t *testing.T, f *fakeReader, accountID, path string) *http.Response {
	t.Helper()
	spec, err := api.GetSpec()
	if err != nil {
		t.Fatal(err)
	}
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/dashboard", func(r chi.Router) { dashboard.Mount(r, f, middleware.Session(ss)) })

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token}) //nolint:gosec // G124: test request cookie, never sent to a browser
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })

	if err := contract.Validate(spec, req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp
}

func TestResponsesMatchContract(t *testing.T) {
	for _, path := range []string{
		"/api/v1/dashboard",
		"/api/v1/dashboard/panels/projects",
		"/api/v1/dashboard/panels/projects?page=2&page_size=5&q=pier",
		"/api/v1/dashboard/panels/top-indicators",
		"/api/v1/dashboard/panels/islands",
	} {
		f := &fakeReader{}
		if resp := get(t, f, owner.String(), path); resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200", path, resp.StatusCode)
		}
		if len(f.asked) != 1 || f.asked[0] != owner {
			t.Fatalf("%s: asked for %v, want only the session account", path, f.asked)
		}
	}
}

// The scored-indicator counts of the latest version reach the JSON body as the
// service gave them: 55 of 55 for a scored version, 0 of 55 for a fresh draft.
func TestProjectsPanelCarriesScoredCounts(t *testing.T) {
	resp := get(t, &fakeReader{}, owner.String(), "/api/v1/dashboard/panels/projects")
	var body struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	want := [][2]float64{{55, 55}, {0, 55}}
	if len(body.Items) != len(want) {
		t.Fatalf("items = %d, want %d", len(body.Items), len(want))
	}
	for i, w := range want {
		got := [2]any{body.Items[i]["latest_version_scored_count"], body.Items[i]["latest_version_indicator_total"]}
		if got[0] != w[0] || got[1] != w[1] {
			t.Fatalf("item %d scored/total = %v, want %v", i, got, w)
		}
	}
}

// Two projects share an indicator: the body lists both nicknames and found_in
// is 2 (the response also passes the contract check inside get).
func TestTopIndicatorsListTheProjects(t *testing.T) {
	resp := get(t, &fakeReader{}, owner.String(), "/api/v1/dashboard/panels/top-indicators")
	var body struct {
		Items []struct {
			FoundIn  int `json:"found_in"`
			Projects []struct {
				ID       string `json:"id"`
				Nickname string `json:"nickname"`
			} `json:"projects"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].FoundIn != 2 || len(body.Items[0].Projects) != 2 ||
		body.Items[0].Projects[0].Nickname != "ALPH" || body.Items[0].Projects[1].Nickname != "BETA" ||
		body.Items[0].Projects[0].ID == "" {
		t.Fatalf("items = %+v, want found_in 2 with ALPH and BETA", body.Items)
	}
}

func TestAdminSeesOnlyOwnFigures(t *testing.T) {
	f := &fakeReader{}
	get(t, f, adminID, "/api/v1/dashboard")
	if len(f.asked) != 1 || f.asked[0].String() != adminID {
		t.Fatalf("asked for %v, want the admin's own id", f.asked)
	}
}

func TestNoSessionIs401(t *testing.T) {
	for _, path := range []string{
		"/api/v1/dashboard",
		"/api/v1/dashboard/panels/projects",
		"/api/v1/dashboard/panels/top-indicators",
		"/api/v1/dashboard/panels/islands",
	} {
		f := &fakeReader{}
		if resp := get(t, f, "", path); resp.StatusCode != http.StatusUnauthorized || len(f.asked) != 0 {
			t.Fatalf("%s: status = %d asked = %v, want 401 and no read", path, resp.StatusCode, f.asked)
		}
	}
}

func TestBadPagingIs400(t *testing.T) {
	for _, q := range []string{"page=0", "page=x", "page_size=101", "q=" + strings.Repeat("a", 101)} {
		if resp := get(t, &fakeReader{}, owner.String(), "/api/v1/dashboard/panels/projects?"+q); resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", q, resp.StatusCode)
		}
	}
}
