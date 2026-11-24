// Package app defines Deps, the dependencies handed to every domain's Routes.
//
// Pattern: router.go builds one Deps and calls handler/<domain>.Routes(r, d)
// for each domain. A feature issue edits only its own handler/<domain>
// package: it builds its service from d inside Routes and mounts its
// handlers, applying d.Auth where a route needs a session and d.RateLimit
// where a route needs a limiter. A feature that needs a new shared
// dependency (pool, queue, storage) asks for an infra issue that adds the
// field here and wires it in cmd/api; router.go itself does not change.
package app

import (
	"crypto/rand"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// Middleware wraps a handler.
type Middleware = func(http.Handler) http.Handler

// Deps are the shared dependencies of the api. Fields are added by infra
// issues (database pool, Valkey, S3, mailer) as the adapters land.
type Deps struct {
	Config config.API
	Logger *slog.Logger

	// DB is the Postgres pool and Valkey the shared state store. Both are
	// nil in tests that do not need them.
	DB     dal.DBTX
	Valkey valkey.StateStore

	// Sessions issues and checks sessions (login handlers call Issue and
	// SetCookie, password reset calls BumpVersion).
	Sessions *session.Service
	// Auth requires a valid session and puts the principal on the context
	// (middleware.PrincipalFrom). Apply it to every signed-in route.
	Auth Middleware
	// RequireAdmin answers 403 unless the signed-in caller is an admin.
	// Mount it after Auth; router.go does so for /api/v1/admin.
	RequireAdmin Middleware
	// CSRF guards unsafe methods; router.go applies it to all of /api/v1.
	CSRF Middleware
	// RateLimit builds a limiter for one route group. prefix names it and its
	// env vars (<prefix>_LIMIT, <prefix>_WINDOW override the defaults), for
	// example RateLimit("RL_LOGIN_IP", 20, 15*time.Minute, middleware.KeyIP).
	RateLimit func(prefix string, defLimit int, defWindow time.Duration, key middleware.KeyFunc) Middleware
}

// PassThrough is a middleware that does nothing, for tests.
func PassThrough(next http.Handler) http.Handler { return next }

// WireAuth builds the session service and the middleware from cfg and sets
// the session, RBAC, CSRF and rate-limit fields of d. db and cache are the
// Postgres pool and the Valkey client.
func (d *Deps) WireAuth(db dal.DBTX, cache valkey.StateStore) error {
	cfg := d.Config
	secret := []byte(cfg.SessionSecret)
	if len(secret) == 0 && cfg.Env != "production" {
		// Development only: sessions end when the process restarts.
		secret = make([]byte, config.MinSessionSecret)
		if _, err := rand.Read(secret); err != nil {
			return fmt.Errorf("app: generate development session secret: %w", err)
		}
	}
	svc, err := session.New(session.Config{
		Secret:      secret,
		SessionTTL:  cfg.SessionTTL,
		RememberTTL: cfg.RememberTTL,
		Insecure:    cfg.Insecure(),
	}, session.PGStore{DB: db}, cache)
	if err != nil {
		return fmt.Errorf("app: session service: %w", err)
	}
	d.DB, d.Valkey, d.Sessions = db, cache, svc
	d.Auth = middleware.Session(svc)
	d.RequireAdmin = middleware.RequireRole(session.RoleAdmin)
	d.CSRF = middleware.CSRF(cfg.AllowedOrigins...)
	d.RateLimit = func(prefix string, defLimit int, defWindow time.Duration, key middleware.KeyFunc) Middleware {
		limit, window := middleware.LimitFromEnv(prefix, defLimit, defWindow)
		return middleware.RateLimit(cache, prefix, limit, window, key)
	}
	return nil
}
