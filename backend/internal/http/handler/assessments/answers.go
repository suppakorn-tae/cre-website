package assessments

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
)

const maxAnswerBody = 256 << 10

// AnswerService is what the handlers need from the answers service.
type AnswerService interface {
	List(ctx context.Context, owner, projectID, versionID uuid.UUID) (svc.AnswerList, error)
	Upsert(ctx context.Context, owner, projectID, versionID uuid.UUID, in []svc.AnswerInput,
		prefix func(i int) string) (svc.AnswerList, error)
}

// MountAnswers registers the answers endpoints on r, which must be the
// /api/v1 root, behind auth.
func MountAnswers(r chi.Router, s AnswerService, auth func(http.Handler) http.Handler) {
	h := answers{s}
	const base = "/projects/{project_id}/versions/{version_id}/answers"
	r.With(auth).Get(base, h.list)
	r.With(auth).Patch(base, h.upsert)
	r.With(auth).Put(base+"/{indicator_code}", h.put)
}

var _ AnswerService = (*svc.AnswerService)(nil)

type answers struct{ s AnswerService }

// ids authenticates the caller and parses the path ids. It writes the
// response and returns false when it cannot.
func ids(w http.ResponseWriter, r *http.Request) (owner, project, version uuid.UUID, ok bool) {
	p, found := middleware.PrincipalFrom(r.Context())
	if !found {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
		return
	}
	var err error
	if owner, err = uuid.Parse(p.AccountID); err != nil {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
		return
	}
	project, err1 := uuid.Parse(chi.URLParam(r, "project_id"))
	version, err2 := uuid.Parse(chi.URLParam(r, "version_id"))
	if err1 != nil || err2 != nil {
		versionNotFound(w, r)
		return
	}
	return owner, project, version, true
}

func (h answers) list(w http.ResponseWriter, r *http.Request) {
	owner, project, version, ok := ids(w, r)
	if !ok {
		return
	}
	l, err := h.s.List(r.Context(), owner, project, version)
	if err != nil {
		fail(w, r, err)
		return
	}
	respond(w, http.StatusOK, toList(l))
}

func (h answers) upsert(w http.ResponseWriter, r *http.Request) {
	owner, project, version, ok := ids(w, r)
	if !ok {
		return
	}
	var body api.AnswerBatchRequest
	if !decode(w, r, &body) {
		return
	}
	if n := len(body.Answers); n < 1 || n > svc.MaxAnswerBatch {
		validation(w, r, []svc.FieldError{{Field: "/answers", Code: "out_of_range"}})
		return
	}
	in := make([]svc.AnswerInput, len(body.Answers))
	for i, a := range body.Answers {
		in[i] = toInput(a)
	}
	l, err := h.s.Upsert(r.Context(), owner, project, version, in,
		func(i int) string { return "/answers/" + strconv.Itoa(i) })
	if err != nil {
		fail(w, r, err)
		return
	}
	respond(w, http.StatusOK, toList(l))
}

func (h answers) put(w http.ResponseWriter, r *http.Request) {
	owner, project, version, ok := ids(w, r)
	if !ok {
		return
	}
	var body api.AnswerInput
	if !decode(w, r, &body) {
		return
	}
	if body.IndicatorCode != chi.URLParam(r, "indicator_code") {
		validation(w, r, []svc.FieldError{{Field: "/indicator_code", Code: "mismatch"}})
		return
	}
	l, err := h.s.Upsert(r.Context(), owner, project, version, []svc.AnswerInput{toInput(body)},
		func(int) string { return "" })
	if err != nil {
		fail(w, r, err)
		return
	}
	if len(l.Items) != 1 {
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "saved answer not found")
		return
	}
	respond(w, http.StatusOK, toAnswer(l.Items[0]))
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxAnswerBody))
	if err := dec.Decode(v); err != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "the body is not valid JSON for this endpoint")
		return false
	}
	return true
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	var v *svc.AnswerValidationError
	switch {
	case errors.As(err, &v):
		validation(w, r, v.Fields)
	case errors.Is(err, svc.ErrAnswerVersionNotFound):
		versionNotFound(w, r)
	case errors.Is(err, svc.ErrAnswerNotEditable):
		middleware.WriteError(w, r, http.StatusConflict, "version_not_editable", "a newer version exists")
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "answers request failed")
	}
}

func versionNotFound(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, r, http.StatusNotFound, "not_found", "version not found")
}

func validation(w http.ResponseWriter, r *http.Request, fields []svc.FieldError) {
	out := make([]api.FieldError, len(fields))
	for i, f := range fields {
		out[i] = api.FieldError{Field: f.Field, Code: f.Code}
	}
	body := api.ValidationErrorBody{Code: "validation_failed", Message: "the request failed validation", Fields: out}
	if id := log.RequestID(r.Context()); id != "" {
		body.RequestId = &id
	}
	respond(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: body})
}

func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// The contract types decimals as float32. A value is turned into its
// shortest float32 decimal text before it is widened, so 0.1 stays 0.1.
func widen(v float32) float64 {
	f, _ := strconv.ParseFloat(strconv.FormatFloat(float64(v), 'f', -1, 32), 64)
	return f
}

func narrow(v float64) float32 { return float32(v) }

func toInput(a api.AnswerInput) svc.AnswerInput {
	in := svc.AnswerInput{IndicatorCode: a.IndicatorCode}
	if a.X != nil {
		x := widen(*a.X)
		in.X = &x
	}
	if a.Y1 != nil {
		in.Y1 = &svc.Impact{Value: widen(a.Y1.Value), Unit: string(a.Y1.Unit)}
	}
	if a.Y2 != nil {
		in.Y2 = &svc.Impact{Value: widen(a.Y2.Value), Unit: string(a.Y2.Unit)}
	}
	if a.Y3 != nil {
		for _, o := range *a.Y3 {
			in.Y3 = append(in.Y3, string(o))
		}
	}
	return in
}

func toAnswer(a svc.Answer) api.Answer {
	out := api.Answer{IndicatorCode: a.IndicatorCode, Complete: a.Complete, UpdatedAt: a.UpdatedAt}
	if a.X != nil {
		x := narrow(*a.X)
		out.X = &x
	}
	if a.Y1 != nil {
		out.Y1 = &api.CostImpact{Value: narrow(a.Y1.Value), Unit: api.CostUnit(a.Y1.Unit)}
	}
	if a.Y2 != nil {
		out.Y2 = &api.TimeImpact{Value: narrow(a.Y2.Value), Unit: api.TimeUnit(a.Y2.Unit)}
	}
	if len(a.Y3) > 0 {
		y3 := make([]api.Y3Option, len(a.Y3))
		for i, o := range a.Y3 {
			y3[i] = api.Y3Option(o)
		}
		out.Y3 = &y3
	}
	return out
}

func toList(l svc.AnswerList) api.AnswerList {
	items := make([]api.Answer, len(l.Items))
	for i, a := range l.Items {
		items[i] = toAnswer(a)
	}
	return api.AnswerList{VersionId: l.VersionID, Editable: l.Editable, Items: items}
}
