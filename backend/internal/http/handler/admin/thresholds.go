package admin

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

const maxThresholdBody = 4 << 10

// ThresholdService is what the handlers need from the Admin Service.
type ThresholdService interface {
	ListRL(ctx context.Context) ([]svc.RLThreshold, error)
	GetRL(ctx context.Context, code string) (svc.RLThreshold, error)
	UpdateRL(ctx context.Context, admin uuid.UUID, code string, v svc.Values) (svc.RLThreshold, error)
}

// MountThresholds registers the threshold endpoints on r (mounted at
// /admin) behind auth and requireAdmin. Routes in routes.go calls it once a
// service can be built from app.Deps.
func MountThresholds(r chi.Router, s ThresholdService, auth, requireAdmin func(http.Handler) http.Handler) {
	h := thresholdHandler{s: s}
	r.Group(func(r chi.Router) {
		r.Use(auth, requireAdmin)
		r.Get("/rl-thresholds", h.list)
		r.Get("/rl-thresholds/{indicator_code}", h.get)
		r.Put("/rl-thresholds/{indicator_code}", h.update)
	})
}

type thresholdHandler struct{ s ThresholdService }

func (h thresholdHandler) list(w http.ResponseWriter, r *http.Request) {
	rows, err := h.s.ListRL(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	items := make([]api.AdminRlThreshold, len(rows))
	for i, t := range rows {
		items[i] = toRL(t)
	}
	writeThresholdJSON(w, http.StatusOK, api.AdminRlThresholdList{Items: items})
}

func (h thresholdHandler) get(w http.ResponseWriter, r *http.Request) {
	t, err := h.s.GetRL(r.Context(), chi.URLParam(r, "indicator_code"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeThresholdJSON(w, http.StatusOK, toRL(t))
}

func (h thresholdHandler) update(w http.ResponseWriter, r *http.Request) {
	adminID, ok := adminFrom(w, r)
	if !ok {
		return
	}
	var req api.AdminUpdateRlThresholdRequest
	if !decodeBody(w, r, &req) {
		return
	}
	th := req.Thresholds
	v := svc.Values{A: f64(th.A), B: f64(th.B), C: f64(th.C), D: f64(th.D), E: f64(th.E)}
	t, err := h.s.UpdateRL(r.Context(), adminID, chi.URLParam(r, "indicator_code"), v)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeThresholdJSON(w, http.StatusOK, toRL(t))
}

func adminFrom(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	if ok {
		if id, err := uuid.Parse(p.AccountID); err == nil {
			return id, true
		}
	}
	middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
	return uuid.Nil, false
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxThresholdBody))
	if err != nil || json.Unmarshal(body, v) != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body is not valid JSON")
		return false
	}
	return true
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	var v svc.ValidationError
	switch {
	case errors.As(err, &v):
		fields := make([]api.FieldError, len(v))
		for i, f := range v {
			fields[i] = api.FieldError{Field: f.Field, Code: f.Code}
		}
		var rid *string
		if id := log.RequestID(r.Context()); id != "" {
			rid = &id
		}
		writeThresholdJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
			Code: "validation_failed", Message: "the request failed validation", Fields: fields, RequestId: rid,
		}})
	case errors.Is(err, svc.ErrIndicatorNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "indicator not found")
	default:
		slog.ErrorContext(r.Context(), "admin thresholds failed", "error", err)
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "request failed")
	}
}

func writeThresholdJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// The contract types thresholds as float32. Going through the shortest
// decimal form keeps 0.1 as 0.1 instead of 0.10000000149.
func f64(p *float32) *float64 {
	if p == nil {
		return nil
	}
	f, _ := strconv.ParseFloat(strconv.FormatFloat(float64(*p), 'g', -1, 32), 64)
	return &f
}

func f32(p *float64) *float32 {
	if p == nil {
		return nil
	}
	f := float32(*p)
	return &f
}

func toRL(t svc.RLThreshold) api.AdminRlThreshold {
	return api.AdminRlThreshold{
		IndicatorCode: t.IndicatorCode,
		Direction:     api.IndicatorDirection(t.Direction),
		Thresholds: api.AdminRlThresholdValues{
			A: f32(t.Values.A), B: f32(t.Values.B), C: f32(t.Values.C), D: f32(t.Values.D), E: f32(t.Values.E),
		},
		Unit:      t.Unit,
		UpdatedAt: t.UpdatedAt.UTC(),
	}
}
