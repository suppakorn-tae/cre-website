// Package http wires the chi router: base middleware, probes and one mount per domain.
package http

import (
	"log/slog"
	"net/http"
	"net/netip"
	"time"

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
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
)

// Deps are the platform pieces the router needs.
type Deps struct {
	Logger         *slog.Logger
	Metrics        *metrics.Metrics
	Health         *health.Checker
	TrustedProxies []netip.Prefix
	RequestTimeout time.Duration
}

// NewRouter builds the api handler. Probes and /metrics sit at the root (not
// routed by Caddy); everything else lives under /api/v1.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.RealIP(d.TrustedProxies),
		d.Metrics.Middleware,
		middleware.Logger(d.Logger),
		middleware.Recoverer(d.Logger),
	)

	r.Method(http.MethodGet, "/healthz", d.Health.Healthz())
	r.Method(http.MethodGet, "/readyz", d.Health.Readyz())
	r.Method(http.MethodGet, "/metrics", d.Metrics.Handler())

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Timeout(d.RequestTimeout))
		r.Route("/auth", auth.Routes)
		r.Route("/account", account.Routes)
		r.Route("/catalogue", catalogue.Routes)
		r.Route("/projects", projects.Routes)
		r.Route("/versions", versions.Routes)
		r.Route("/assessments", assessments.Routes)
		r.Route("/results", results.Routes)
		r.Route("/dashboard", dashboard.Routes)
		r.Route("/jobs", jobs.Routes)
		r.Route("/reports", reports.Routes)
		r.Route("/admin", admin.Routes)
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "Not found")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
	})
	return r
}
