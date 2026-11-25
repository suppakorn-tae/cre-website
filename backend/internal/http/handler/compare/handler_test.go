package compare_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/compare"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/compare"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	owner   = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	project = uuid.MustParse("33333333-3333-4333-8333-333333333333")
	v1      = uuid.MustParse("44444444-4444-4444-8444-444444444444")
	v2      = uuid.MustParse("55555555-5555-4555-8555-555555555555")
	draft   = uuid.MustParse("66666666-6666-4666-8666-666666666666")
	at      = time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC)
)

// fake owns one project with submitted v1, v2 and a draft v3. Anything else
// is absent. It records who asked.
type fake struct{ asked []uuid.UUID }

func (f *fake) check(o, p uuid.UUID) error {
	f.asked = append(f.asked, o)
	if o != owner || p != project {
		return svc.ErrNotFound
	}
	return nil
}

func metrics(id uuid.UUID, no int, avg float64) svc.Metrics {
	return svc.Metrics{VersionID: id, VersionNo: no, SubmittedAt: at, ProgressAtSubmit: 80, AvgRM: &avg, HVhCount: 3, ScoredCount: 10}
}

func (f *fake) Compare(_ context.Context, o, p, target uuid.UUID, base *uuid.UUID) (svc.Comparison, error) {
	if err := f.check(o, p); err != nil {
		return svc.Comparison{}, err
	}
	switch {
	case target == draft || (base != nil && *base == draft):
		return svc.Comparison{}, svc.ErrNotSubmitted
	case target == v1 && base == nil:
		return svc.Comparison{}, svc.ErrNoBase
	case base != nil && *base == target:
		return svc.Comparison{}, svc.ErrSameVersion
	case target != v2 || (base != nil && *base != v1):
		return svc.Comparison{}, svc.ErrNotFound
	}
	return svc.Comparison{
		Base: metrics(v1, 1, 3.25), Target: metrics(v2, 2, 3.5), LevelUp: 1,
		Changes: []svc.LevelChange{{
			IndicatorCode: "I01", FactorCode: "F1", BaseLevel: "M", TargetLevel: "H", BaseRM: 3.2, TargetRM: 3.7, Up: true,
		}},
	}, nil
}

func (f *fake) Trend(_ context.Context, o, p uuid.UUID) ([]svc.TrendPoint, error) {
	if err := f.check(o, p); err != nil {
		return nil, err
	}
	avg, hvh := 3.25, 3
	return []svc.TrendPoint{
		{VersionID: v1, VersionNo: 1, Submitted: true, SubmittedAt: &at, AvgRM: &avg, HVhCount: &hvh, Levels: &svc.Levels{M: 7, H: 2, VH: 1}},
		{VersionID: draft, VersionNo: 2},
	}, nil
}

func (f *fake) IndicatorRM(_ context.Context, o, p uuid.UUID, factors, _ []string) (svc.RmMatrix, error) {
	if err := f.check(o, p); err != nil {
		return svc.RmMatrix{}, err
	}
	rm, lvl := 3.2, "M"
	rows := []svc.RmRow{{IndicatorCode: "I01", FactorCode: "F1", Points: []svc.RmPoint{
		{VersionID: v1, RM: &rm, Level: &lvl}, {VersionID: draft},
	}}}
	if len(factors) > 0 && factors[0] != "F1" {
		rows = []svc.RmRow{}
	}
	return svc.RmMatrix{
		Versions:   []svc.RmVersion{{VersionID: v1, VersionNo: 1, Submitted: true}, {VersionID: draft, VersionNo: 2}},
		Indicators: rows,
	}, nil
}

type accounts struct{}

func (accounts) GetRecord(_ context.Context, id string) (session.Record, error) {
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

// get calls GET path as accountID ("" for no session) and checks the response
// against the OpenAPI contract.
func get(t *testing.T, f *fake, accountID, path string) *http.Response {
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
	r.Route("/api/v1/projects", func(r chi.Router) { compare.Mount(r, f, middleware.Session(ss)) })

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if accountID != "" {
		token, _ := ss.Issue(accountID, 1, false)
		req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
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

const base = "/api/v1/projects/33333333-3333-4333-8333-333333333333"

func TestResponsesMatchContract(t *testing.T) {
	for _, path := range []string{
		base + "/compare?target_version_id=" + v2.String(),
		base + "/compare?target_version_id=" + v2.String() + "&base_version_id=" + v1.String(),
		base + "/trend",
		base + "/indicator-rm",
		base + "/indicator-rm?factor_code=F1&factor_code=F2&indicator_code=I01",
	} {
		if resp := get(t, &fake{}, owner.String(), path); resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200", path, resp.StatusCode)
		}
	}
}

func TestErrorStatuses(t *testing.T) {
	other := "99999999-9999-4999-8999-999999999999"
	cases := []struct {
		name, account, path string
		want                int
	}{
		{"other user's project", other, base + "/trend", http.StatusNotFound},
		{"other user's project compare", other, base + "/compare?target_version_id=" + v2.String(), http.StatusNotFound},
		{"other user's project rm", other, base + "/indicator-rm", http.StatusNotFound},
		{"unknown project", owner.String(), "/api/v1/projects/" + other + "/trend", http.StatusNotFound},
		{"version of another project", owner.String(), base + "/compare?target_version_id=" + other, http.StatusNotFound},
		{"base of another project", owner.String(), base + "/compare?target_version_id=" + v2.String() + "&base_version_id=" + other, http.StatusNotFound},
		{"draft target", owner.String(), base + "/compare?target_version_id=" + draft.String(), http.StatusConflict},
		{"no earlier version", owner.String(), base + "/compare?target_version_id=" + v1.String(), http.StatusConflict},
		{"same version", owner.String(), base + "/compare?target_version_id=" + v2.String() + "&base_version_id=" + v2.String(), http.StatusUnprocessableEntity},
		{"missing target", owner.String(), base + "/compare", http.StatusBadRequest},
		{"bad base", owner.String(), base + "/compare?target_version_id=" + v2.String() + "&base_version_id=x", http.StatusBadRequest},
		{"no session", "", base + "/trend", http.StatusUnauthorized},
	}
	for _, c := range cases {
		if resp := get(t, &fake{}, c.account, c.path); resp.StatusCode != c.want {
			t.Errorf("%s: status = %d, want %d", c.name, resp.StatusCode, c.want)
		}
	}
}

func TestOwnerComesFromSession(t *testing.T) {
	f := &fake{}
	get(t, f, owner.String(), base+"/trend?owner_id=99999999-9999-4999-8999-999999999999")
	if len(f.asked) != 1 || f.asked[0] != owner {
		t.Fatalf("asked for %v, want only the session account", f.asked)
	}
}
