// Package app defines Deps, the dependencies handed to every domain's Routes.
//
// Pattern: router.go builds one Deps and calls handler/<domain>.Routes(r, d)
// for each domain. A feature issue edits only its own handler/<domain>
// package: it builds its service from d inside Routes and mounts its
// handlers, applying d.Auth where a route needs a session. A feature that
// needs a new shared dependency (pool, queue, storage) asks for an infra
// issue that adds the field here and wires it in cmd/api; router.go itself
// does not change.
package app

import (
	"log/slog"
	"net/http"

	"github.com/suppakorn-tae/cre-website/backend/internal/config"
)

// Deps are the shared dependencies of the api. Fields are added by infra
// issues (database pool, Valkey, S3, mailer) as the adapters land.
type Deps struct {
	Config config.API
	Logger *slog.Logger
	// Auth is the session middleware for protected routes. It passes requests
	// through until the auth issue replaces it with the server-checked one.
	Auth func(http.Handler) http.Handler
}

// PassThrough is the placeholder Auth middleware.
func PassThrough(next http.Handler) http.Handler { return next }
