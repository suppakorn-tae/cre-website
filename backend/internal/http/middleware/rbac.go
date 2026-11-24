package middleware

import "net/http"

// RequireRole answers 403 `forbidden` unless the caller's role (from the
// account record, set by Session) is role. Mount it after Session.
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := PrincipalFrom(r.Context())
			if !ok {
				WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
				return
			}
			if p.Role != role {
				WriteError(w, r, http.StatusForbidden, "forbidden", "role not allowed")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
