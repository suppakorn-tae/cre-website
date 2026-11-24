// Package versions holds the versions HTTP handlers.
package versions

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
)

// Routes is a no-op. The version paths live under /projects/{project_id}/
// versions, which router.go mounts for the projects handler, so they are
// registered by Mount from the projects routes (see Mount).
func Routes(_ chi.Router, _ app.Deps) {}
