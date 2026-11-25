// Package account holds the account HTTP handlers (UC-04).
package account

import (
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/account"
)

// Routes registers the account endpoints under /account. Every route needs a
// session (d.Auth) and only ever touches the session's own account.
//
// Rate limits, per account (env <prefix>_LIMIT and <prefix>_WINDOW override
// the defaults): RL_ACCOUNT_PASSWORD, RL_ACCOUNT_DELETE.
func Routes(r chi.Router, d app.Deps) {
	db, ok := d.DB.(svc.DB)
	if !ok || d.Auth == nil || d.Sessions == nil {
		return
	}
	h := handler{s: svc.New(db, d.Sessions, d.Valkey), sessions: d.Sessions}
	rl := d.RateLimit
	if rl == nil { // Deps built without WireAuth (router tests)
		rl = func(string, int, time.Duration, middleware.KeyFunc) app.Middleware { return app.PassThrough }
	}
	r.Use(d.Auth)
	r.Get("/", h.get)
	r.Patch("/", h.update)
	r.With(rl("RL_ACCOUNT_DELETE", 5, 15*time.Minute, keyAccount)).Delete("/", h.delete)
	r.With(rl("RL_ACCOUNT_PASSWORD", 10, 15*time.Minute, keyAccount)).Put("/password", h.changePassword)
}
