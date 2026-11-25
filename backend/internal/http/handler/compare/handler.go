// Package compare holds the version compare, RM trend and indicator RM
// HTTP handlers (UC-21).
package compare

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/compare"
)

// Service is what the handlers need from the Version Compare Service.
type Service interface {
	Compare(ctx context.Context, owner, project, target uuid.UUID, base *uuid.UUID) (svc.Comparison, error)
	Trend(ctx context.Context, owner, project uuid.UUID) ([]svc.TrendPoint, error)
	IndicatorRM(ctx context.Context, owner, project uuid.UUID, factors, indicators []string) (svc.RmMatrix, error)
}

// Mount registers the endpoints on r, which must be mounted at /projects.
// Every route needs a session; the owner is always the signed-in account.
func Mount(r chi.Router, s Service, auth func(http.Handler) http.Handler) {
	h := handler{s: s}
	r.With(auth).Get("/{project_id}/compare", h.compare)
	r.With(auth).Get("/{project_id}/trend", h.trend)
	r.With(auth).Get("/{project_id}/indicator-rm", h.indicatorRM)
}

type handler struct{ s Service }

func bad(w http.ResponseWriter, r *http.Request, msg string) {
	middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", msg)
}

// ids returns the session account and the project in the path, or answers.
func ids(w http.ResponseWriter, r *http.Request) (owner, project uuid.UUID, ok bool) {
	p, has := middleware.PrincipalFrom(r.Context())
	if has {
		owner, _ = uuid.Parse(p.AccountID)
	}
	if !has || owner == uuid.Nil {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
		return owner, project, false
	}
	project, err := uuid.Parse(chi.URLParam(r, "project_id"))
	if err != nil {
		// An id that cannot exist is an absent project.
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "project not found")
		return owner, project, false
	}
	return owner, project, true
}

func (h handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, svc.ErrNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "version not found")
	case errors.Is(err, svc.ErrNotSubmitted):
		middleware.WriteError(w, r, http.StatusConflict, "version_not_submitted", "both versions must be submitted")
	case errors.Is(err, svc.ErrNoBase):
		middleware.WriteError(w, r, http.StatusConflict, "no_base_version", "no earlier submitted version to compare with")
	case errors.Is(err, svc.ErrSameVersion):
		rid := log.RequestID(r.Context())
		writeJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
			Code: "validation_failed", Message: "one or more fields are invalid", RequestId: &rid,
			Fields: []api.FieldError{{Field: "base_version_id", Code: "same_as_target"}},
		}})
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "compare request failed")
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// The generated types use float32 for RM, which cannot hold a rounded
// decimal exactly, so the wire types below carry float64.
type wireMetrics struct {
	VersionID        uuid.UUID `json:"version_id"`
	VersionNo        int       `json:"version_no"`
	SubmittedAt      time.Time `json:"submitted_at"`
	ProgressAtSubmit int       `json:"progress_at_submit"`
	AvgRM            *float64  `json:"avg_rm"`
	HVhCount         int       `json:"h_vh_count"`
	ScoredCount      int       `json:"scored_count"`
}

type wireChange struct {
	IndicatorCode string  `json:"indicator_code"`
	FactorCode    string  `json:"factor_code"`
	BaseLevel     string  `json:"base_level"`
	TargetLevel   string  `json:"target_level"`
	BaseRM        float64 `json:"base_rm"`
	TargetRM      float64 `json:"target_rm"`
	Direction     string  `json:"direction"`
}

func metrics(m svc.Metrics) wireMetrics { return wireMetrics(m) }

func (h handler) compare(w http.ResponseWriter, r *http.Request) {
	owner, project, ok := ids(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	target, err := uuid.Parse(q.Get("target_version_id"))
	if err != nil {
		bad(w, r, "target_version_id must be a uuid")
		return
	}
	var base *uuid.UUID
	if raw := q.Get("base_version_id"); raw != "" {
		b, err := uuid.Parse(raw)
		if err != nil {
			bad(w, r, "base_version_id must be a uuid")
			return
		}
		base = &b
	}
	c, err := h.s.Compare(r.Context(), owner, project, target, base)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	changes := make([]wireChange, len(c.Changes))
	for i, x := range c.Changes {
		dir := "down"
		if x.Up {
			dir = "up"
		}
		changes[i] = wireChange{
			IndicatorCode: x.IndicatorCode, FactorCode: x.FactorCode, BaseLevel: x.BaseLevel,
			TargetLevel: x.TargetLevel, BaseRM: x.BaseRM, TargetRM: x.TargetRM, Direction: dir,
		}
	}
	writeJSON(w, http.StatusOK, struct {
		Base      wireMetrics  `json:"base"`
		Target    wireMetrics  `json:"target"`
		Up        int          `json:"level_up_count"`
		Down      int          `json:"level_down_count"`
		LevelDiff []wireChange `json:"level_changes"`
	}{metrics(c.Base), metrics(c.Target), c.LevelUp, c.LevelDown, changes})
}

type wireTrendPoint struct {
	VersionID         uuid.UUID         `json:"version_id"`
	VersionNo         int               `json:"version_no"`
	Status            api.VersionStatus `json:"status"`
	SubmittedAt       *time.Time        `json:"submitted_at"`
	AvgRM             *float64          `json:"avg_rm"`
	HVhCount          *int              `json:"h_vh_count"`
	LevelDistribution *api.LevelCounts  `json:"level_distribution"`
}

func (h handler) trend(w http.ResponseWriter, r *http.Request) {
	owner, project, ok := ids(w, r)
	if !ok {
		return
	}
	pts, err := h.s.Trend(r.Context(), owner, project)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	out := make([]wireTrendPoint, len(pts))
	for i, p := range pts {
		status := api.VersionStatus("draft")
		if p.Submitted {
			status = "submitted"
		}
		out[i] = wireTrendPoint{
			VersionID: p.VersionID, VersionNo: p.VersionNo, Status: status,
			SubmittedAt: p.SubmittedAt, AvgRM: p.AvgRM, HVhCount: p.HVhCount,
		}
		if l := p.Levels; l != nil {
			out[i].LevelDistribution = &api.LevelCounts{VL: l.VL, L: l.L, M: l.M, H: l.H, VH: l.VH}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": out})
}

type wireRmPoint struct {
	VersionID uuid.UUID `json:"version_id"`
	RM        *float64  `json:"rm"`
	Level     *string   `json:"level"`
}

type wireRmRow struct {
	IndicatorCode string        `json:"indicator_code"`
	FactorCode    string        `json:"factor_code"`
	Points        []wireRmPoint `json:"points"`
}

func (h handler) indicatorRM(w http.ResponseWriter, r *http.Request) {
	owner, project, ok := ids(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	m, err := h.s.IndicatorRM(r.Context(), owner, project, q["factor_code"], q["indicator_code"])
	if err != nil {
		h.fail(w, r, err)
		return
	}
	versions := make([]api.IndicatorRmVersion, len(m.Versions))
	for i, v := range m.Versions {
		versions[i] = api.IndicatorRmVersion{VersionId: v.VersionID, VersionNo: v.VersionNo, Submitted: v.Submitted}
	}
	rows := make([]wireRmRow, len(m.Indicators))
	for i, x := range m.Indicators {
		pts := make([]wireRmPoint, len(x.Points))
		for j, p := range x.Points {
			pts[j] = wireRmPoint(p)
		}
		rows[i] = wireRmRow{IndicatorCode: x.IndicatorCode, FactorCode: x.FactorCode, Points: pts}
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions, "indicators": rows})
}
