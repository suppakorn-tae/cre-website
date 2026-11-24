// Package http wires the chi router: base middleware, probes and one mount per domain.
package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/account"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/catalogue"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/dashboard"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/projects"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/results"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/versions"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
)

// Deps are what the router needs: the shared app.Deps handed to every domain
// plus the probe and metrics handlers it serves itself.
type Deps struct {
	app.Deps
	Metrics *metrics.Metrics
	Health  *health.Checker
}

// NewRouter builds the api handler. Probes and /metrics sit at the root (not
// routed by Caddy); everything else lives under /api/v1. Domains get their
// dependencies through Routes(r, d), so feature branches never edit this file.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.RealIP(d.Config.TrustedProxies),
		d.Metrics.Middleware,
		middleware.Logger(d.Logger),
		middleware.Recoverer(d.Logger),
	)

	r.Method(http.MethodGet, "/healthz", d.Health.Healthz())
	r.Method(http.MethodGet, "/readyz", d.Health.Readyz())
	r.Method(http.MethodGet, "/metrics", d.Metrics.Handler())

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Timeout(d.Config.RequestTimeout), d.CSRF)
		r.Route("/auth", func(r chi.Router) { auth.Routes(r, d.Deps) })
		r.Route("/account", func(r chi.Router) { account.Routes(r, d.Deps) })
		r.Route("/catalogue", func(r chi.Router) { catalogue.Routes(r, d.Deps) })
		r.Route("/projects", func(r chi.Router) { projects.Routes(r, d.Deps) })
		r.Route("/versions", func(r chi.Router) { versions.Routes(r, d.Deps) })
		r.Route("/assessments", func(r chi.Router) { assessments.Routes(r, d.Deps) })
		r.Route("/results", func(r chi.Router) { results.Routes(r, d.Deps) })
		r.Route("/dashboard", func(r chi.Router) { dashboard.Routes(r, d.Deps) })
		r.Route("/jobs", func(r chi.Router) { jobs.Routes(r, d.Deps) })
		r.Route("/reports", func(r chi.Router) { reports.Routes(r, d.Deps) })
		// With, not Use inside the group: the guard then wraps the mount
		// itself and runs for every path under /admin.
		r.With(d.Auth, d.RequireAdmin).Route("/admin", func(r chi.Router) { admin.Routes(r, d.Deps) })
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "Not found")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
	})
	return r
}
