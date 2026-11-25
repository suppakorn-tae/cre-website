package dashboard

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/dashboard"
)

// Reader is what the handlers need from the Dashboard Service.
type Reader interface {
	Summary(ctx context.Context, owner uuid.UUID) (svc.Summary, error)
	Projects(ctx context.Context, owner uuid.UUID, p svc.ProjectsParams) (svc.ProjectsPage, error)
	TopIndicators(ctx context.Context, owner uuid.UUID) ([]svc.TopIndicator, error)
	Islands(ctx context.Context, owner uuid.UUID) ([]svc.IslandGroup, error)
}

// Mount registers the dashboard endpoints on r (mounted at /dashboard) behind
// auth. Tests mount it with fakes; Routes mounts it with the real service.
// The owner is always the signed-in account, whatever its role.
func Mount(r chi.Router, s Reader, auth func(http.Handler) http.Handler) {
	h := handler{s: s}
	r.Group(func(r chi.Router) {
		r.Use(auth)
		r.Get("/", h.summary)
		r.Get("/panels/projects", h.projects)
		r.Get("/panels/top-indicators", h.topIndicators)
		r.Get("/panels/islands", h.islands)
	})
}

type handler struct{ s Reader }

// owner returns the session account, or answers 401.
func owner(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	if ok {
		if id, err := uuid.Parse(p.AccountID); err == nil {
			return id, true
		}
	}
	middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
	return uuid.Nil, false
}

func fail(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "dashboard lookup failed")
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(v)
}

// The generated types use float32 for baht and RM, which cannot hold 15
// digits, so the figures below are written as exact JSON numbers.
type wireKpis struct {
	api.DashboardKpis
	TotalValueBaht json.Number `json:"total_value_baht"`
}

type wireSummary struct {
	Kpis              wireKpis                   `json:"kpis"`
	LevelDistribution api.LevelCounts            `json:"level_distribution"`
	ProjectRisks      []api.DashboardProjectRisk `json:"project_risks"`
}

func (h handler) summary(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(w, r)
	if !ok {
		return
	}
	s, err := h.s.Summary(r.Context(), id)
	if err != nil {
		fail(w, r)
		return
	}
	out := wireSummary{
		Kpis: wireKpis{
			DashboardKpis: api.DashboardKpis{
				ProjectCount: s.Kpis.ProjectCount, VersionCount: s.Kpis.VersionCount,
				HVhIndicatorCount: s.Kpis.HVhIndicatorCount, IslandCount: s.Kpis.IslandCount,
			},
			TotalValueBaht: json.Number(s.Kpis.TotalValueBaht),
		},
		LevelDistribution: api.LevelCounts{
			VL: s.Levels.VL, L: s.Levels.L, M: s.Levels.M, H: s.Levels.H, VH: s.Levels.VH,
		},
		ProjectRisks: make([]api.DashboardProjectRisk, len(s.ProjectRisks)),
	}
	for i, p := range s.ProjectRisks {
		out.ProjectRisks[i] = api.DashboardProjectRisk{
			ProjectId: p.ProjectID, Name: p.Name, Nickname: p.Nickname,
			VersionId: p.VersionID, VersionNo: p.VersionNo, HCount: p.HCount, VhCount: p.VhCount,
		}
	}
	writeJSON(w, out)
}

type wireItem struct {
	api.DashboardProjectItem
	ValueBaht json.Number  `json:"value_baht"`
	AvgRM     *json.Number `json:"avg_rm"`
}

type wireList struct {
	Items []wireItem   `json:"items"`
	Page  api.PageMeta `json:"page"`
}

func (h handler) projects(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	page, pageSize := 1, 20
	if !intParam(q.Get("page"), 1, 1<<20, &page) || !intParam(q.Get("page_size"), 1, 100, &pageSize) ||
		len([]rune(q.Get("q"))) > 100 {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "invalid page, page_size or q")
		return
	}
	res, err := h.s.Projects(r.Context(), id, svc.ProjectsParams{Q: q.Get("q"), Page: page, PageSize: pageSize})
	if err != nil {
		fail(w, r)
		return
	}
	out := wireList{
		Items: make([]wireItem, len(res.Items)),
		Page:  api.PageMeta{Page: page, PageSize: pageSize, Total: res.Total},
	}
	for i, p := range res.Items {
		it := wireItem{
			DashboardProjectItem: api.DashboardProjectItem{
				ProjectId: p.ProjectID, Name: p.Name, Nickname: p.Nickname,
				IslandCode: p.IslandCode, IslandOther: p.IslandOther,
				TypeCode: p.TypeCode, TypeOther: p.TypeOther, ProgressPct: p.ProgressPct,
				VersionCount: p.VersionCount, LatestVersionId: p.LatestVersionID,
				LatestVersionNo: p.LatestVersionNo, LatestVersionStatus: api.VersionStatus(p.LatestVersionStatus),
				LatestSubmittedVersionId: p.LatestSubmittedVersionID, HVhCount: p.HVhCount,
			},
			ValueBaht: json.Number(p.ValueBaht),
		}
		if p.AvgRM != nil {
			n := json.Number(*p.AvgRM)
			it.AvgRM = &n
		}
		out.Items[i] = it
	}
	writeJSON(w, out)
}

// intParam parses an optional integer query value within [lo, hi].
func intParam(s string, lo, hi int, dst *int) bool {
	if s == "" {
		return true
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < lo || n > hi {
		return false
	}
	*dst = n
	return true
}

func (h handler) topIndicators(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(w, r)
	if !ok {
		return
	}
	rows, err := h.s.TopIndicators(r.Context(), id)
	if err != nil {
		fail(w, r)
		return
	}
	out := api.DashboardTopIndicators{Items: make([]api.DashboardTopIndicator, len(rows))}
	for i, t := range rows {
		out.Items[i] = api.DashboardTopIndicator{
			Rank: t.Rank, IndicatorCode: t.IndicatorCode, FactorCode: t.FactorCode,
			HCount: t.HCount, VhCount: t.VhCount,
		}
	}
	writeJSON(w, out)
}

func (h handler) islands(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(w, r)
	if !ok {
		return
	}
	groups, err := h.s.Islands(r.Context(), id)
	if err != nil {
		fail(w, r)
		return
	}
	out := api.DashboardIslands{Items: make([]api.DashboardIslandGroup, len(groups))}
	for i, g := range groups {
		ps := make([]api.DashboardIslandProject, len(g.Projects))
		for j, p := range g.Projects {
			ps[j] = api.DashboardIslandProject{
				ProjectId: p.ProjectID, Name: p.Name, Nickname: p.Nickname,
				ProgressPct: p.ProgressPct, LatestVersionId: p.LatestVersionID, HVhCount: p.HVhCount,
			}
		}
		out.Items[i] = api.DashboardIslandGroup{IslandCode: g.IslandCode, Projects: ps}
	}
	writeJSON(w, out)
}
