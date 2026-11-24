package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// me serves GET /auth/me (AuthSession in the contract). It is mounted behind
// the session middleware, which has already checked status and version.
func me(svc *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.PrincipalFrom(r.Context())
		if !ok {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
			return
		}
		pr, err := svc.Profile(r.Context(), p.AccountID)
		if errors.Is(err, session.ErrNoAccount) {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
			return
		}
		id, perr := uuid.Parse(pr.ID)
		if err != nil || perr != nil {
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "profile load failed")
			return
		}
		loginWriteSession(w, http.StatusOK, pr, id, p.Expires, p.Remember)
	}
}

// loginWriteSession writes AuthSession for an account profile.
func loginWriteSession(w http.ResponseWriter, status int, pr session.Profile, id uuid.UUID, expires time.Time, remember bool) {
	terms := pr.TermsAcceptedAt
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(api.AuthSession{
		User: api.Account{
			Id: id, Email: pr.Email, Role: api.UserRole(pr.Role), Organisation: pr.Organisation,
			SignInMethods:   api.SignInMethods{Password: pr.HasPassword, Google: pr.HasGoogle},
			TermsAcceptedAt: &terms, CreatedAt: pr.CreatedAt.UTC(),
		},
		ExpiresAt:    expires.UTC(),
		KeepLoggedIn: remember,
	})
}
