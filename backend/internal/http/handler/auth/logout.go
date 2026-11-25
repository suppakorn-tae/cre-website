package auth

import (
	"net/http"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// logout serves POST /auth/logout: it clears this device's cookie only. It
// is mounted without the session middleware, so an expired or invalid
// session still gets its cookie cleared.
func logout(sessions *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		sessions.ClearCookie(w)
		w.WriteHeader(http.StatusNoContent)
	}
}
