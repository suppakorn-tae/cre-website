package admin

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

const maxAdviceBody = 64 << 10

// Advice is what the handlers need from the advice service.
type Advice interface {
	Get(ctx context.Context, code string) (svc.AdviceSet, error)
	Replace(ctx context.Context, actor uuid.UUID, code, list string, items []svc.AdviceItem) (svc.AdviceList, error)
}

// MountAdvice registers the advice endpoints on r (mounted at /admin behind
// Auth and RequireAdmin by router.go). Routes in routes.go is not owned by
// this feature, so the wiring calls MountAdvice once the service can be built.
func MountAdvice(r chi.Router, s Advice) {
	r.Get("/advice/{indicator_code}", getAdvice(s))
	r.Put("/advice/{indicator_code}/{list}", replaceAdvice(s))
}

func getAdvice(s Advice) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		set, err := s.Get(r.Context(), chi.URLParam(r, "indicator_code"))
		if err != nil {
			adviceFail(w, r, err)
			return
		}
		out := api.AdminAdviceLists{IndicatorCode: set.IndicatorCode, UpdatedAt: set.UpdatedAt}
		out.Lists.RL = toAPIItems(set.Lists["RL"])
		out.Lists.RIC = toAPIItems(set.Lists["RI_C"])
		out.Lists.RIT = toAPIItems(set.Lists["RI_T"])
		out.Lists.RIE = toAPIItems(set.Lists["RI_E"])
		writeAdviceJSON(w, http.StatusOK, out)
	}
}

func replaceAdvice(s Advice) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.PrincipalFrom(r.Context())
		if !ok {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
			return
		}
		actor, err := uuid.Parse(p.AccountID)
		if err != nil {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
			return
		}
		list := chi.URLParam(r, "list")
		if !slices.Contains(svc.AdviceLists, list) {
			middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "unknown advice list")
			return
		}
		var req api.AdminReplaceAdviceRequest
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxAdviceBody))
		if err != nil || json.Unmarshal(body, &req) != nil {
			middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body is not valid JSON")
			return
		}
		code := chi.URLParam(r, "indicator_code")
		res, err := s.Replace(r.Context(), actor, code, list, fromAPIItems(req.Items))
		if err != nil {
			adviceFail(w, r, err)
			return
		}
		writeAdviceJSON(w, http.StatusOK, api.AdminAdviceListResponse{
			IndicatorCode: res.IndicatorCode, List: api.AdviceList(res.List),
			Items: toAPIItems(res.Items), UpdatedAt: res.UpdatedAt,
		})
	}
}

func adviceFail(w http.ResponseWriter, r *http.Request, err error) {
	var v svc.ValidationError
	switch {
	case errors.As(err, &v):
		fields := make([]api.FieldError, len(v))
		for i, f := range v {
			fields[i] = api.FieldError{Field: f.Field, Code: f.Code}
		}
		rid := log.RequestID(r.Context())
		var ridp *string
		if rid != "" {
			ridp = &rid
		}
		writeAdviceJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
			Code: "validation_failed", Message: "the request failed validation", Fields: fields, RequestId: ridp,
		}})
	case errors.Is(err, svc.ErrNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "indicator not found")
	default:
		slog.ErrorContext(r.Context(), "advice request failed", "error", err)
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "advice request failed")
	}
}

func writeAdviceJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func toAPIItems(items []svc.AdviceItem) api.AdminAdviceItemList {
	out := make(api.AdminAdviceItemList, len(items))
	for i, it := range items {
		t := api.AdminAdviceText{Th: it.Text[svc.DefaultLocale], AdditionalProperties: map[string]string{}}
		for loc, s := range it.Text {
			if loc != svc.DefaultLocale {
				t.AdditionalProperties[loc] = s
			}
		}
		out[i] = api.AdminAdviceItem{Text: t}
	}
	return out
}

func fromAPIItems(items api.AdminAdviceItemList) []svc.AdviceItem {
	out := make([]svc.AdviceItem, len(items))
	for i, it := range items {
		text := map[string]string{svc.DefaultLocale: it.Text.Th}
		for loc, s := range it.Text.AdditionalProperties {
			text[loc] = s
		}
		out[i] = svc.AdviceItem{Text: text}
	}
	return out
}
