package admin

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
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/export"
)

const maxExportBody = 1 << 20

// ExportService is what the handlers need from the export service.
type ExportService interface {
	Request(ctx context.Context, adminID uuid.UUID, p svc.Params) (uuid.UUID, error)
	Download(ctx context.Context, jobID uuid.UUID) (svc.File, error)
}

// MountExport registers the export endpoints on r (mounted at /admin) behind
// auth and requireAdmin. Routes in routes.go calls it once an export service
// can be built from app.Deps (it needs S3, a job enqueuer and the audit
// service).
func MountExport(r chi.Router, s ExportService, auth, requireAdmin func(http.Handler) http.Handler) {
	h := exportHandler{s: s}
	r.Group(func(r chi.Router) {
		r.Use(auth, requireAdmin)
		r.Post("/exports", h.request)
		r.Get("/exports/{job_id}/download", h.download)
	})
}

type exportHandler struct{ s ExportService }

func (h exportHandler) request(w http.ResponseWriter, r *http.Request) {
	adminID, ok := adminFrom(w, r)
	if !ok {
		return
	}
	var req api.AdminExportRequest
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxExportBody))
	if err != nil || json.Unmarshal(body, &req) != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body is not valid JSON")
		return
	}
	p := svc.Params{Scope: svc.Scope(req.Scope), IncludeDeleted: req.IncludeDeleted}
	if req.UserIds != nil {
		p.UserIDs = *req.UserIds
	}
	id, err := h.s.Request(r.Context(), adminID, p)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeThresholdJSON(w, http.StatusAccepted, api.JobAccepted{JobId: id})
}

func (h exportHandler) download(w http.ResponseWriter, r *http.Request) {
	jobID, err := uuid.Parse(chi.URLParam(r, "job_id"))
	if err != nil {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "export not found")
		return
	}
	f, err := h.s.Download(r.Context(), jobID)
	switch {
	case errors.Is(err, svc.ErrNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "export not found")
	case errors.Is(err, svc.ErrNotReady):
		middleware.WriteError(w, r, http.StatusConflict, "export_not_ready", "the export is not ready")
	case errors.Is(err, svc.ErrFileMissing):
		middleware.WriteError(w, r, http.StatusConflict, "export_file_missing", "the export file is missing; request it again")
	case errors.Is(err, svc.ErrExpired):
		middleware.WriteError(w, r, http.StatusGone, "export_expired", "the export has expired; request a new one")
	case err != nil:
		fail(w, r, err)
	default:
		defer func() { _ = f.Body.Close() }()
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", f.Disposition)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, f.Body)
	}
}
