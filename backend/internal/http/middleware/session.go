package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

type principalKey struct{}

// PrincipalFrom returns the authenticated caller set by Session.
func PrincipalFrom(ctx context.Context) (session.Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(session.Principal)
	return p, ok
}

// Session requires a valid session cookie. The account must be active and
// its session version must match the token; the role is taken from the
// account record. Failures answer 401 `unauthenticated`. Request id and
// client IP stay available through log.RequestID and ClientIP.
func Session(svc *session.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(session.CookieName)
			if err != nil || c.Value == "" {
				WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
				return
			}
			p, err := svc.Authenticate(r.Context(), c.Value)
			switch {
			case err == nil:
				ctx := context.WithValue(r.Context(), principalKey{}, p)
				if p.Role == session.RoleAdmin {
					// Admin services write audit rows from this context.
					if id, perr := uuid.Parse(p.AccountID); perr == nil {
						ctx = audit.WithAdmin(ctx, id)
						ctx = audit.WithClientIP(ctx, ClientIP(ctx))
					}
				}
				next.ServeHTTP(w, r.WithContext(ctx))
			case errors.Is(err, session.ErrInvalidToken),
				errors.Is(err, session.ErrExpired),
				errors.Is(err, session.ErrRevoked):
				WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session is not valid")
			default:
				// Fail closed, and keep the cause for ops: the request log line
				// carries only the status. The logger adds the request id.
				slog.ErrorContext(r.Context(), "session check failed", "error", err)
				WriteError(w, r, http.StatusInternalServerError, "internal", "session check failed")
			}
		})
	}
}
