// Package reports holds the reports HTTP handlers.
package reports

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
)

// Routes registers the reports endpoints. It does nothing yet: the service
// needs an S3 store, a transaction Beginner and a queue Enqueuer, and
// app.Deps carries none of them. An infra issue adds them to Deps; then this
// builds the service and calls Mount. The request endpoint is mounted under
// /projects by the projects routes with Request.
func Routes(_ chi.Router, _ app.Deps) {}
