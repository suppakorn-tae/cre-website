// Package auth holds the auth HTTP handlers.
package auth

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
)

// Routes registers the auth endpoints. The CSRF middleware is already applied
// by the router to the whole /api/v1 tree; the feature issues add login,
// registration, OTP and password reset here, wrapping each in d.RateLimit.
func Routes(r chi.Router, d app.Deps) {
	r.Get("/csrf", csrfToken(d.Config.Insecure()))
	r.With(d.Auth).Get("/me", me(d.Sessions))
}
