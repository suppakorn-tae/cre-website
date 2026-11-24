package auth

import (
	"net/http"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// logout serves POST /auth/logout: it clears this device's cookie only.
func logout(sessions *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		sessions.ClearCookie(w)
		w.WriteHeader(http.StatusNoContent)
	}
}
