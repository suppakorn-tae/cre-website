package results

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/results"
)

// Service is what the handlers need from the Results Service.
type Service interface {
	Get(ctx context.Context, projectID, versionID, owner uuid.UUID) (svc.Results, error)
	SetStrategy(ctx context.Context, projectID, versionID, owner uuid.UUID, code, strategy string) (svc.Choice, error)
}

// Mount registers the results endpoints on r, which must be mounted at
// /projects (the projects routes call it). Every route needs a session and
// works on the signed-in account's own projects only.
func Mount(r chi.Router, s Service, auth func(http.Handler) http.Handler) {
	r.With(auth).Get("/{project_id}/versions/{version_id}/results", withOwner(get(s)))
	r.With(auth).Put("/{project_id}/versions/{version_id}/results/{indicator_code}/strategy", withOwner(putStrategy(s)))
}

type handler func(w http.ResponseWriter, r *http.Request, owner uuid.UUID)

// withOwner resolves the signed-in account for h.
func withOwner(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.PrincipalFrom(r.Context())
		if !ok {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
			return
		}
		owner, err := uuid.Parse(p.AccountID)
		if err != nil {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
			return
		}
		h(w, r, owner)
	}
}

func get(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, vid, ok := ids(w, r)
		if !ok {
			return
		}
		res, err := s.Get(r.Context(), pid, vid, owner)
		if err != nil {
			fail(w, r, err)
			return
		}
		_ = api.GetResults200JSONResponse(toAPI(res)).VisitGetResultsResponse(w)
	}
}

func putStrategy(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, vid, ok := ids(w, r)
		if !ok {
			return
		}
		var body struct {
			Strategy string `json:"strategy"`
		}
		dec := json.NewDecoder(io.LimitReader(r.Body, 1<<10))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&body); err != nil || dec.More() {
			middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body must be one valid JSON object")
			return
		}
		c, err := s.SetStrategy(r.Context(), pid, vid, owner, chi.URLParam(r, "indicator_code"), body.Strategy)
		if err != nil {
			fail(w, r, err)
			return
		}
		_ = api.PutStrategy200JSONResponse(api.StrategyChoice{
			IndicatorCode: c.IndicatorCode, Strategy: api.RiskStrategy(c.Strategy), UpdatedAt: c.UpdatedAt,
		}).VisitPutStrategyResponse(w)
	}
}

// ids parses the project and version path parameters; a malformed one is a
// 404, as the resource cannot exist.
func ids(w http.ResponseWriter, r *http.Request) (project, version uuid.UUID, ok bool) {
	project, err := uuid.Parse(chi.URLParam(r, "project_id"))
	if err == nil {
		version, err = uuid.Parse(chi.URLParam(r, "version_id"))
	}
	if err != nil {
		notFound(w, r)
		return uuid.Nil, uuid.Nil, false
	}
	return project, version, true
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, svc.ErrNotFound):
		notFound(w, r)
	case errors.Is(err, svc.ErrNotLatest):
		middleware.WriteError(w, r, http.StatusConflict, "version_not_latest", "only the latest version can change strategies")
	case errors.Is(err, svc.ErrNotHighRisk):
		invalid(w, r, "not_high_risk", "/indicator_code", "not_high_risk")
	case errors.Is(err, svc.ErrInvalidStrategy):
		invalid(w, r, "validation_failed", "/strategy", "invalid")
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "results request failed")
	}
}

func invalid(w http.ResponseWriter, r *http.Request, code, field, fieldCode string) {
	rid := log.RequestID(r.Context())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
		Code: code, Message: "request is not valid", RequestId: &rid,
		Fields: []api.FieldError{{Field: field, Code: fieldCode}},
	}})
}

func notFound(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, r, http.StatusNotFound, "not_found", "not found")
}

func toAPI(res svc.Results) api.ResultsResponse {
	lc := res.LevelCounts
	avg := float32(res.AverageRM)
	out := api.ResultsResponse{
		VersionId: res.VersionID, SubmittedAt: res.SubmittedAt, Editable: res.Editable,
		Summary: api.ResultsSummary{
			ScoredCount: len(res.Items), AverageRm: &avg,
			LevelCounts: api.LevelCounts{VL: lc["VL"], L: lc["L"], M: lc["M"], H: lc["H"], VH: lc["VH"]},
		},
		Items: make([]api.IndicatorResult, len(res.Items)),
	}
	for i, it := range res.Items {
		r := api.IndicatorResult{
			IndicatorCode: it.Code, X: float32(it.X), Y1Pct: float32(it.Y1Pct), Y2Pct: float32(it.Y2Pct),
			Rl: float32(it.RL), RiC: float32(it.RIC), RiT: float32(it.RIT), RiE: float32(it.RIE),
			RiMax: float32(it.RIMax), Rm: float32(it.RM), Level: api.RiskLevel(it.Level),
			StrategyUpdatedAt: it.StrategyUpdatedAt,
		}
		if it.Strategy != nil {
			st := api.RiskStrategy(*it.Strategy)
			r.Strategy = &st
		}
		if len(it.Advice) > 0 {
			adv := make([]api.AdviceListItems, len(it.Advice))
			for j, a := range it.Advice {
				adv[j] = api.AdviceListItems{List: api.AdviceList(a.List), Items: a.Items}
			}
			r.Advice = &adv
		}
		out.Items[i] = r
	}
	return out
}
