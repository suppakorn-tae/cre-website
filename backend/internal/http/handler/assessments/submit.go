package assessments

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
)

// Submitter is what the submit handler needs from the assessments service.
type Submitter interface {
	Submit(ctx context.Context, owner, projectID, versionID uuid.UUID) (svc.SubmitResult, error)
}

// MountSubmit registers POST /{project_id}/versions/{version_id}/submit on r,
// which must be mounted at /projects. It needs a session.
func MountSubmit(r chi.Router, s Submitter, auth func(http.Handler) http.Handler) {
	r.With(auth).Post("/{project_id}/versions/{version_id}/submit", submit(s))
}

func submit(s Submitter) http.HandlerFunc {
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
		// A malformed id cannot exist: 404, as for any other missing resource.
		pid, perr := uuid.Parse(chi.URLParam(r, "project_id"))
		vid, verr := uuid.Parse(chi.URLParam(r, "version_id"))
		if perr != nil || verr != nil {
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "not found")
			return
		}
		res, err := s.Submit(r.Context(), owner, pid, vid)
		switch {
		case errors.Is(err, svc.ErrSubmitNotFound):
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "not found")
		case errors.Is(err, svc.ErrSubmitNotLatest):
			middleware.WriteError(w, r, http.StatusConflict, "version_not_editable", "only the latest version can be submitted")
		case errors.Is(err, svc.ErrNoCompleteIndicator):
			noCompleteIndicator(w, r)
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "submit failed")
		default:
			_ = api.SubmitVersion200JSONResponse(toSubmitResponse(vid, res)).VisitSubmitVersionResponse(w)
		}
	}
}

func toSubmitResponse(id uuid.UUID, r svc.SubmitResult) api.SubmitResponse {
	avg := float32(r.AverageRM)
	return api.SubmitResponse{
		VersionId: id, Status: api.VersionStatus("submitted"), SubmittedAt: r.SubmittedAt,
		Summary: api.ResultsSummary{
			ScoredCount: r.Scored, AverageRm: &avg,
			LevelCounts: api.LevelCounts{
				VL: r.LevelCounts[engine.LevelVL], L: r.LevelCounts[engine.LevelL], M: r.LevelCounts[engine.LevelM],
				H: r.LevelCounts[engine.LevelH], VH: r.LevelCounts[engine.LevelVH],
			},
		},
	}
}

// noCompleteIndicator answers 422 in the ValidationErrorEnvelope shape the
// contract requires; no single field is at fault, so fields is empty.
func noCompleteIndicator(w http.ResponseWriter, r *http.Request) {
	rid := log.RequestID(r.Context())
	body := api.ValidationErrorBody{
		Code: "no_complete_indicator", Message: "no indicator is complete",
		Fields: []api.FieldError{}, RequestId: &rid,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(struct {
		Error api.ValidationErrorBody `json:"error"`
	}{body})
}
