package auth

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// logout serves POST /auth/logout: it ends this device's session on the
// server (the token is refused from now on, even if a copy of the cookie
// survives) and clears the cookie. Other devices stay signed in. It is
// mounted without the session middleware, so an expired or invalid session
// still gets its cookie cleared.
func logout(sessions *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessions.ClearCookie(w)
		if err := sessions.RevokeRequest(r); err != nil {
			slog.ErrorContext(r.Context(), "log out: revoke session failed", "error", err)
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "log out failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// replaceSession sets the cookie of a new sign-in and ends the session the
// request came with, if any, so a sign-in never leaves an older token of
// this browser valid. A failed revoke is logged; the sign-in still succeeds.
func replaceSession(w http.ResponseWriter, r *http.Request, sessions *session.Service, token string, exp time.Time, remember bool) {
	if err := sessions.RevokeRequest(r); err != nil {
		slog.ErrorContext(r.Context(), "sign in: revoke previous session failed", "error", err)
	}
	sessions.SetCookie(w, token, exp, remember)
}
