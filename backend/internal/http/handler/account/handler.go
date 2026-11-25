package account

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/account"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

const maxBody = 16 << 10

type handler struct {
	s        *svc.Service
	sessions *session.Service
}

// keyAccount rate-limits by the signed-in account.
func keyAccount(r *http.Request) string {
	p, _ := middleware.PrincipalFrom(r.Context())
	return p.AccountID
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func toAPI(a svc.Account) api.Account {
	out := api.Account{
		Id: a.ID, Email: a.Email, Role: api.UserRole(a.Role), Organisation: a.Organisation,
		SignInMethods: api.SignInMethods{Password: a.Password, Google: a.Google},
		CreatedAt:     a.CreatedAt.UTC(),
	}
	if a.TermsAcceptedAt != nil {
		t := a.TermsAcceptedAt.UTC()
		out.TermsAcceptedAt = &t
	}
	return out
}

func self(w http.ResponseWriter, r *http.Request) (session.Principal, uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	id, err := uuid.Parse(p.AccountID)
	if !ok || err != nil {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
		return p, uuid.Nil, false
	}
	return p, id, true
}

// decode reads a JSON body. An empty body is accepted when allowEmpty.
func decode(w http.ResponseWriter, r *http.Request, v any, allowEmpty bool) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err == nil && len(body) == 0 && allowEmpty {
		return true
	}
	if err != nil || json.Unmarshal(body, v) != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body is not valid JSON")
		return false
	}
	return true
}

func (handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var fe *svc.FieldError
	switch {
	case errors.As(err, &fe):
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{
			"code": "validation_failed", "message": "validation failed",
			"request_id": log.RequestID(r.Context()),
			"fields":     []map[string]string{{"field": fe.Field, "code": fe.Code}},
		}})
	case errors.Is(err, svc.ErrNoPassword):
		middleware.WriteError(w, r, http.StatusConflict, "no_password", "the account has no password")
	case errors.Is(err, svc.ErrReauthRequired):
		middleware.WriteError(w, r, http.StatusForbidden, "reauth_required", "re-authentication required")
	case errors.Is(err, svc.ErrNotFound):
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "request failed")
	}
}

func (h handler) get(w http.ResponseWriter, r *http.Request) {
	_, id, ok := self(w, r)
	if !ok {
		return
	}
	a, err := h.s.Get(r.Context(), id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(a))
}

func (h handler) update(w http.ResponseWriter, r *http.Request) {
	_, id, ok := self(w, r)
	if !ok {
		return
	}
	var req api.UpdateAccountRequest
	if !decode(w, r, &req, false) {
		return
	}
	a, err := h.s.UpdateOrganisation(r.Context(), id, req.Organisation)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(a))
}

func (h handler) changePassword(w http.ResponseWriter, r *http.Request) {
	p, id, ok := self(w, r)
	if !ok {
		return
	}
	var req api.ChangePasswordRequest
	if !decode(w, r, &req, false) {
		return
	}
	version, err := h.s.ChangePassword(r.Context(), id, req.CurrentPassword, req.NewPassword, req.NewPasswordConfirmation)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	// Every other device is signed out; this one keeps a fresh cookie.
	tok, exp := h.sessions.Issue(p.AccountID, version, p.Remember)
	h.sessions.SetCookie(w, tok, exp, p.Remember)
	w.WriteHeader(http.StatusNoContent)
}

func (h handler) delete(w http.ResponseWriter, r *http.Request) {
	_, id, ok := self(w, r)
	if !ok {
		return
	}
	var req api.DeleteAccountRequest
	if !decode(w, r, &req, true) {
		return
	}
	if err := h.s.Delete(r.Context(), id, req.CurrentPassword); err != nil {
		h.fail(w, r, err)
		return
	}
	h.sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}
