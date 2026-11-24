package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

type usersHandler struct{ s *svc.UserService }

func toAPI(u svc.User) api.AdminUser {
	methods := []api.AdminSignInMethod{}
	if u.Password {
		methods = append(methods, api.AdminSignInMethodPassword)
	}
	if u.Google {
		methods = append(methods, api.AdminSignInMethodGoogle)
	}
	var email *openapi_types.Email
	if u.Email != nil {
		e := openapi_types.Email(*u.Email)
		email = &e
	}
	return api.AdminUser{
		Id: u.ID, Email: email, Organisation: u.Organisation, SignInMethods: methods,
		Role: api.UserRole(u.Role), Status: api.AccountStatus(u.Status),
		ProjectCount: u.ProjectCount, VersionCount: u.VersionCount,
		CreatedAt: u.CreatedAt.UTC(), UpdatedAt: u.UpdatedAt.UTC(),
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// invalid writes the 422 envelope with one field error.
func invalid(w http.ResponseWriter, r *http.Request, field, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{
		"code": "validation_failed", "message": "validation failed",
		"request_id": log.RequestID(r.Context()),
		"fields":     []map[string]string{{"field": field, "code": code}},
	}})
}

// fail maps a service error to the error envelope.
func (usersHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, svc.ErrNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "user not found")
	case errors.Is(err, svc.ErrSelf):
		middleware.WriteError(w, r, http.StatusConflict, "own_account", "cannot do this to your own account")
	case errors.Is(err, svc.ErrLastAdmin):
		middleware.WriteError(w, r, http.StatusConflict, "last_admin", "the last active admin cannot be changed")
	case errors.Is(err, svc.ErrState):
		middleware.WriteError(w, r, http.StatusConflict, "invalid_state", "account state does not allow this")
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "request failed")
	}
}

func actor(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	id, err := uuid.Parse(p.AccountID)
	if !ok || err != nil {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
		return uuid.Nil, false
	}
	return id, true
}

func target(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "user not found")
		return uuid.Nil, false
	}
	return id, true
}

func (h usersHandler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := svc.ListParams{Query: q.Get("q"), Role: q.Get("role"), Status: q.Get("status"), Page: 1, PageSize: 20}
	if len(p.Query) > 200 {
		invalid(w, r, "/q", "too_long")
		return
	}
	if p.Role != "" && p.Role != "user" && p.Role != "admin" {
		invalid(w, r, "/role", "invalid_value")
		return
	}
	if p.Status != "" && p.Status != "active" && p.Status != "deactivated" && p.Status != "deleted" {
		invalid(w, r, "/status", "invalid_value")
		return
	}
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			invalid(w, r, "/page", "invalid_value")
			return
		}
		p.Page = n
	}
	if v := q.Get("page_size"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			invalid(w, r, "/page_size", "invalid_value")
			return
		}
		p.PageSize = n
	}
	pg, err := h.s.List(r.Context(), p)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	items := make([]api.AdminUser, 0, len(pg.Items))
	for _, u := range pg.Items {
		items = append(items, toAPI(u))
	}
	writeJSON(w, http.StatusOK, api.AdminUserPage{
		Items: items, Meta: api.PageMeta{Page: pg.Page, PageSize: pg.PageSize, Total: pg.Total},
	})
}

func (h usersHandler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := target(w, r)
	if !ok {
		return
	}
	u, err := h.s.Get(r.Context(), id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(u))
}

func (h usersHandler) changeRole(w http.ResponseWriter, r *http.Request) {
	me, ok := actor(w, r)
	if !ok {
		return
	}
	id, ok := target(w, r)
	if !ok {
		return
	}
	var body api.AdminChangeRoleRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "malformed JSON body")
		return
	}
	if body.Role != api.UserRole("user") && body.Role != api.UserRole("admin") {
		invalid(w, r, "/role", "invalid_value")
		return
	}
	u, err := h.s.ChangeRole(r.Context(), me, id, string(body.Role))
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(u))
}

func (h usersHandler) deactivate(w http.ResponseWriter, r *http.Request) {
	me, ok := actor(w, r)
	if !ok {
		return
	}
	id, ok := target(w, r)
	if !ok {
		return
	}
	u, err := h.s.Deactivate(r.Context(), me, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(u))
}

func (h usersHandler) reactivate(w http.ResponseWriter, r *http.Request) {
	id, ok := target(w, r)
	if !ok {
		return
	}
	u, err := h.s.Reactivate(r.Context(), id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(u))
}

func (h usersHandler) delete(w http.ResponseWriter, r *http.Request) {
	me, ok := actor(w, r)
	if !ok {
		return
	}
	id, ok := target(w, r)
	if !ok {
		return
	}
	if err := h.s.Delete(r.Context(), me, id); err != nil {
		h.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// mountUsers registers the user management routes.
func mountUsers(r chi.Router, s *svc.UserService) {
	h := usersHandler{s: s}
	r.Get("/users", h.list)
	r.Get("/users/{user_id}", h.get)
	r.Delete("/users/{user_id}", h.delete)
	r.Put("/users/{user_id}/role", h.changeRole)
	r.Post("/users/{user_id}/deactivate", h.deactivate)
	r.Post("/users/{user_id}/reactivate", h.reactivate)
}
