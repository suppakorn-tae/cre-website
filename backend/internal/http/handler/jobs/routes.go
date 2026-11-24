// Package jobs holds the jobs HTTP handlers.
package jobs

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

// Routes registers the jobs endpoints. It does nothing when the database or
// the session middleware is missing (tests that build bare Deps).
func Routes(r chi.Router, d app.Deps) {
	if d.DB == nil || d.Auth == nil {
		return
	}
	Mount(r, svc.NewReader(d.DB), d.Auth)
}
