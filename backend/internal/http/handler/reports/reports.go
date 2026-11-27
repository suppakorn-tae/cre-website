package reports

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
)

// Service is what the handlers need from the reports service.
type Service interface {
	Request(ctx context.Context, requester, projectID, versionID uuid.UUID) (uuid.UUID, error)
	Download(ctx context.Context, requester, jobID uuid.UUID) (svc.File, error)
}

// Mount registers GET /{job_id}/download on r (mounted at /reports) behind
// auth. The request endpoint lives under /projects/{project_id}/versions/
// {version_id}/reports; mount Request there.
func Mount(r chi.Router, s Service, auth func(http.Handler) http.Handler) {
	r.With(auth).Get("/{job_id}/download", Download(s))
}

// Request handles POST /projects/{project_id}/versions/{version_id}/reports.
// The route needs the session middleware in front of it and chi URL params
// named project_id and version_id.
func Request(s Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requester, ok := caller(w, r)
		if !ok {
			return
		}
		projectID, err1 := uuid.Parse(chi.URLParam(r, "project_id"))
		versionID, err2 := uuid.Parse(chi.URLParam(r, "version_id"))
		if err1 != nil || err2 != nil {
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "version not found")
			return
		}
		jobID, err := s.Request(r.Context(), requester, projectID, versionID)
		switch {
		case errors.Is(err, svc.ErrNotFound):
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "version not found")
		case errors.Is(err, svc.ErrNotSubmitted):
			middleware.WriteError(w, r, http.StatusConflict, "version_not_submitted", "the version is not submitted")
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "report request failed")
		default:
			_ = api.RequestReport202JSONResponse(api.JobAccepted{JobId: jobID}).VisitRequestReportResponse(w)
		}
	}
}

// Download handles GET /reports/{job_id}/download.
func Download(s Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requester, ok := caller(w, r)
		if !ok {
			return
		}
		jobID, err := uuid.Parse(chi.URLParam(r, "job_id"))
		if err != nil {
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "report not found")
			return
		}
		disposition := r.URL.Query().Get("disposition")
		if disposition != "" && disposition != "attachment" && disposition != "inline" {
			middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "disposition must be attachment or inline")
			return
		}
		f, err := s.Download(r.Context(), requester, jobID)
		switch {
		case errors.Is(err, svc.ErrNotFound):
			middleware.WriteError(w, r, http.StatusNotFound, "not_found", "report not found")
		case errors.Is(err, svc.ErrExpired):
			middleware.WriteError(w, r, http.StatusConflict, "report_expired", "a newer report replaced this one; request it again")
		case errors.Is(err, svc.ErrNotReady):
			middleware.WriteError(w, r, http.StatusConflict, "report_not_ready", "the report is not ready")
		case errors.Is(err, svc.ErrFileMissing):
			middleware.WriteError(w, r, http.StatusConflict, "report_file_missing", "the report file is missing; request it again")
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "report download failed")
		default:
			defer func() { _ = f.Body.Close() }()
			w.Header().Set("Content-Type", "application/pdf")
			header := f.Disposition
			if disposition == "inline" {
				header = "inline" + strings.TrimPrefix(header, "attachment")
			}
			w.Header().Set("Content-Disposition", header)
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, f.Body)
		}
	}
}

func caller(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	if ok {
		if id, err := uuid.Parse(p.AccountID); err == nil {
			return id, true
		}
	}
	middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
	return uuid.Nil, false
}
