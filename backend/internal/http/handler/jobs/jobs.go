package jobs

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

// Getter is what the handler needs from the Jobs Service.
type Getter interface {
	GetForRequester(ctx context.Context, id, requester uuid.UUID) (svc.Job, error)
}

// Mount registers GET /{id} on r (mounted at /jobs) behind auth. Tests mount
// it with fakes; Routes mounts it with the real service.
func Mount(r chi.Router, s Getter, auth func(http.Handler) http.Handler) {
	r.With(auth).Get("/{id}", get(s))
}

func get(s Getter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.PrincipalFrom(r.Context())
		if !ok {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
			return
		}
		requester, err := uuid.Parse(p.AccountID)
		if err != nil {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			notFound(w, r)
			return
		}
		j, err := s.GetForRequester(r.Context(), id, requester)
		switch {
		case errors.Is(err, svc.ErrNotFound):
			notFound(w, r)
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "job lookup failed")
		default:
			_ = api.GetJob200JSONResponse(toAPI(j)).VisitGetJobResponse(w)
		}
	}
}

func notFound(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, r, http.StatusNotFound, "not_found", "job not found")
}

func toAPI(j svc.Job) api.Job {
	return api.Job{
		Id:         j.ID,
		Kind:       api.JobKind(j.Kind),
		Status:     api.JobStatus(j.Status),
		CreatedAt:  j.CreatedAt,
		StartedAt:  j.StartedAt,
		FinishedAt: j.FinishedAt,
		ExpiresAt:  j.ExpiresAt,
		Error:      j.Error,
	}
}
