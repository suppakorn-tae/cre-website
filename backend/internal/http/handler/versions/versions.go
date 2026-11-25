package versions

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
)

// Service is what the handlers need from the Versions Service.
type Service interface {
	Create(ctx context.Context, projectID, owner uuid.UUID) (svc.Version, error)
	List(ctx context.Context, projectID, owner uuid.UUID) ([]svc.Version, error)
	Get(ctx context.Context, projectID, id, owner uuid.UUID) (svc.Version, error)
	Delete(ctx context.Context, projectID, id, owner uuid.UUID) error
}

// Mount registers the version endpoints on r, which must be mounted at
// /projects (the projects routes call it). Every route needs a session.
func Mount(r chi.Router, s Service, auth func(http.Handler) http.Handler) {
	r.With(auth).Get("/{project_id}/versions", withOwner(list(s)))
	r.With(auth).Post("/{project_id}/versions", withOwner(create(s)))
	r.With(auth).Get("/{project_id}/versions/{version_id}", withOwner(get(s)))
	r.With(auth).Delete("/{project_id}/versions/{version_id}", withOwner(remove(s)))
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

func list(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, ok := pathID(w, r, "project_id")
		if !ok {
			return
		}
		vs, err := s.List(r.Context(), pid, owner)
		if err != nil {
			fail(w, r, err)
			return
		}
		items := make([]api.VersionSummary, len(vs))
		for i, v := range vs {
			items[i] = toSummary(v)
		}
		_ = api.ListVersions200JSONResponse(api.VersionList{Items: items}).VisitListVersionsResponse(w)
	}
}

func create(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, ok := pathID(w, r, "project_id")
		if !ok {
			return
		}
		v, err := s.Create(r.Context(), pid, owner)
		if err != nil {
			fail(w, r, err)
			return
		}
		_ = api.CreateVersion201JSONResponse(toAPI(v)).VisitCreateVersionResponse(w)
	}
}

func get(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, ok := pathID(w, r, "project_id")
		if !ok {
			return
		}
		vid, ok := pathID(w, r, "version_id")
		if !ok {
			return
		}
		v, err := s.Get(r.Context(), pid, vid, owner)
		if err != nil {
			fail(w, r, err)
			return
		}
		_ = api.GetVersion200JSONResponse(toAPI(v)).VisitGetVersionResponse(w)
	}
}

func remove(s Service) handler {
	return func(w http.ResponseWriter, r *http.Request, owner uuid.UUID) {
		pid, ok := pathID(w, r, "project_id")
		if !ok {
			return
		}
		vid, ok := pathID(w, r, "version_id")
		if !ok {
			return
		}
		if err := s.Delete(r.Context(), pid, vid, owner); err != nil {
			fail(w, r, err)
			return
		}
		_ = api.DeleteVersion204Response{}.VisitDeleteVersionResponse(w)
	}
}

// pathID parses a UUID path parameter; a malformed one is a 404, as the
// resource cannot exist.
func pathID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		notFound(w, r)
		return uuid.Nil, false
	}
	return id, true
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, svc.ErrNotFound) {
		notFound(w, r)
		return
	}
	middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "version request failed")
}

func notFound(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, r, http.StatusNotFound, "not_found", "not found")
}

func toSummary(v svc.Version) api.VersionSummary {
	return api.VersionSummary{
		Id: v.ID, ProjectId: v.ProjectID, VersionNo: v.No, Status: api.VersionStatus(v.Status),
		Editable: v.Editable, CreatedAt: v.CreatedAt, SubmittedAt: v.SubmittedAt,
		ProgressAtSubmit: v.ProgressAtSubmit, HighCount: v.HighCount, VeryHighCount: v.VeryHighCount,
		AverageRm: f32(v.AverageRM), ScoredCount: v.ScoredCount, LevelCounts: levelCounts(v.LevelCounts),
	}
}

// levelCounts maps the stored counts, nil for a draft.
func levelCounts(m map[string]int) *api.LevelCounts {
	if m == nil {
		return nil
	}
	return &api.LevelCounts{VL: m["VL"], L: m["L"], M: m["M"], H: m["H"], VH: m["VH"]}
}

func toAPI(v svc.Version) api.Version {
	return api.Version{
		Id: v.ID, ProjectId: v.ProjectID, VersionNo: v.No, Status: api.VersionStatus(v.Status),
		Editable: v.Editable, CreatedAt: v.CreatedAt, SubmittedAt: v.SubmittedAt,
		ProgressAtSubmit: v.ProgressAtSubmit, HighCount: v.HighCount, VeryHighCount: v.VeryHighCount,
		AverageRm: f32(v.AverageRM), ScoredCount: v.ScoredCount, LevelCounts: levelCounts(v.LevelCounts),
		SubmissionNo: v.SubmissionNo, ValueBaht: float32(v.ValueBaht),
		StartDate: openapi_types.Date{Time: v.StartDate}, EndDate: openapi_types.Date{Time: v.EndDate},
	}
}

func f32(f *float64) *float32 {
	if f == nil {
		return nil
	}
	v := float32(*f)
	return &v
}
