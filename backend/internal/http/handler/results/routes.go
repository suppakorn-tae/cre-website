// Package results holds the results HTTP handlers.
package results

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
)

// Routes is a no-op. The results paths live under /projects/{project_id}/
// versions, which router.go mounts for the projects handler, so they are
// registered by Mount from the projects routes (see Mount).
func Routes(_ chi.Router, _ app.Deps) {}
