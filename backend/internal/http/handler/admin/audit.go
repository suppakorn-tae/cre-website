package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

type auditHandler struct{ s *audit.Reader }

// auditInvalid answers 400 bad_request: the contract lists 400 for bad query
// parameters (ErrorEnvelope) and reserves 422 for body validation.
func auditInvalid(w http.ResponseWriter, r *http.Request, field, _ string) {
	middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "invalid query parameter "+strings.TrimPrefix(field, "/"))
}

func auditWriteJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(v)
}

func toSummary(s audit.Summary) api.AdminAuditEntrySummary {
	return api.AdminAuditEntrySummary{
		Id: s.ID, OccurredAt: s.OccurredAt.UTC(), AdminId: s.AdminID, AdminEmail: s.AdminEmail,
		Action: api.AuditAction(s.Action), TargetType: s.TargetType, TargetId: s.TargetID,
	}
}

func validAction(a string) bool {
	switch audit.Action(a) {
	case audit.UserRoleChange, audit.UserDeactivate, audit.UserReactivate, audit.UserDelete,
		audit.AdviceEdit, audit.RLThresholdEdit, audit.ImpactTableEdit,
		audit.ExportRequest, audit.ExportDownload:
		return true
	}
	return false
}

func (h auditHandler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := audit.Filter{Page: 1, PageSize: 20}
	if v := q.Get("admin_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			auditInvalid(w, r, "/admin_id", "invalid_value")
			return
		}
		f.AdminID = &id
	}
	if v := q.Get("action"); v != "" {
		if !validAction(v) {
			auditInvalid(w, r, "/action", "invalid_value")
			return
		}
		a := audit.Action(v)
		f.Action = &a
	}
	if v := q.Get("target_type"); v != "" {
		f.TargetType = &v
	}
	if v := q.Get("target_id"); v != "" {
		if f.TargetType == nil {
			auditInvalid(w, r, "/target_type", "required")
			return
		}
		f.TargetID = &v
	}
	for _, p := range []struct {
		name string
		dst  **time.Time
	}{{"from", &f.From}, {"to", &f.To}} {
		if v := q.Get(p.name); v != "" {
			t, err := time.Parse(time.RFC3339, v)
			if err != nil {
				auditInvalid(w, r, "/"+p.name, "invalid_value")
				return
			}
			*p.dst = &t
		}
	}
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			auditInvalid(w, r, "/page", "invalid_value")
			return
		}
		f.Page = n
	}
	if v := q.Get("page_size"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			auditInvalid(w, r, "/page_size", "invalid_value")
			return
		}
		f.PageSize = n
	}
	pg, err := h.s.List(r.Context(), f)
	if err != nil {
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "request failed")
		return
	}
	items := make([]api.AdminAuditEntrySummary, 0, len(pg.Items))
	for _, s := range pg.Items {
		items = append(items, toSummary(s))
	}
	auditWriteJSON(w, api.AdminAuditPage{
		Items: items, Meta: api.PageMeta{Page: pg.Page, PageSize: pg.PageSize, Total: int(pg.Total)},
	})
}

func (h auditHandler) get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "audit_id"), 10, 64)
	if err != nil {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "audit entry not found")
		return
	}
	d, err := h.s.Get(r.Context(), id)
	if errors.Is(err, audit.ErrNotFound) {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "audit entry not found")
		return
	}
	if err != nil {
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "request failed")
		return
	}
	s := toSummary(d.Summary)
	out := api.AdminAuditEntry{
		Id: s.Id, OccurredAt: s.OccurredAt, AdminId: s.AdminId, AdminEmail: s.AdminEmail,
		Action: s.Action, TargetType: s.TargetType, TargetId: s.TargetId,
		RequestId: d.RequestID,
	}
	if d.OldValue != nil {
		out.OldValue = d.OldValue
	}
	if d.NewValue != nil {
		out.NewValue = d.NewValue
	}
	if d.IPAddress != nil {
		ip := d.IPAddress.String()
		out.IpAddress = &ip
	}
	auditWriteJSON(w, out)
}

// mountAudit registers the read-only audit log routes. There is no write,
// update or delete route.
func mountAudit(r chi.Router, s *audit.Reader) {
	h := auditHandler{s: s}
	r.Get("/audit-log", h.list)
	r.Get("/audit-log/{audit_id}", h.get)
}
