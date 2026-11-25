package admin

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"slices"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
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
			fail(w, r, err)
			return
		}
		out := api.AdminAdviceLists{IndicatorCode: set.IndicatorCode, UpdatedAt: set.UpdatedAt, UpdatedBy: toAPIEmail(set.UpdatedBy)}
		out.Lists.RL = toAPIItems(set.Lists["RL"])
		out.Lists.RIC = toAPIItems(set.Lists["RI_C"])
		out.Lists.RIT = toAPIItems(set.Lists["RI_T"])
		out.Lists.RIE = toAPIItems(set.Lists["RI_E"])
		writeJSON(w, http.StatusOK, out)
	}
}

func replaceAdvice(s Advice) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actor, ok := adminFrom(w, r)
		if !ok {
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
			fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, api.AdminAdviceListResponse{
			IndicatorCode: res.IndicatorCode, List: api.AdviceList(res.List),
			Items: toAPIItems(res.Items), UpdatedAt: res.UpdatedAt, UpdatedBy: toAPIEmail(res.UpdatedBy),
		})
	}
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

func toAPIEmail(s *string) *openapi_types.Email {
	if s == nil {
		return nil
	}
	e := openapi_types.Email(*s)
	return &e
}
