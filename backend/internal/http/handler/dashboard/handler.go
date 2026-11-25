package dashboard

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/dashboard"
)

// Reader is what the handlers need from the Dashboard Service.
type Reader interface {
	Summary(ctx context.Context, owner uuid.UUID) (svc.Summary, error)
}

// Mount registers the dashboard endpoints on r (mounted at /dashboard) behind
// auth. Tests mount it with fakes; Routes mounts it with the real service.
// The owner is always the signed-in account, whatever its role.
func Mount(r chi.Router, s Reader, auth func(http.Handler) http.Handler) {
	h := handler{s: s}
	r.Group(func(r chi.Router) {
		r.Use(auth)
		r.Get("/", h.summary)
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
