// Package catalogue holds the catalogue HTTP handlers.
package catalogue

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
)

// Routes is mounted by router.go at /api/v1/catalogue. It stays a no-op until
// app.Deps carries the database pool and Valkey client (an infra issue), when
// it builds the service and calls New(...).MountCatalogue(r) and
// MountLookups on the /api/v1 router (islands and project types are not under
// /catalogue in the contract, so router.go needs one extra mount).
func Routes(_ chi.Router, _ app.Deps) {}
