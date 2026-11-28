package auth

import (
	"encoding/json"
	"net/http"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
)

// csrfToken serves GET /auth/csrf: it sets the CSRF cookie
// (middleware.CSRFCookie) and returns the same token in the body
// (CsrfToken in the contract).
func csrfToken(insecure bool) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		tok := middleware.NewCSRFToken()
		middleware.SetCSRFCookie(w, tok, insecure)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(api.CsrfToken{CsrfToken: tok})
	}
}
