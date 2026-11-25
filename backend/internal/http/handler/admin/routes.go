// Package admin holds the admin HTTP handlers.
package admin

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

// Routes registers the admin endpoints. The router already applies Auth and
// RequireAdmin to everything under /admin.
func Routes(r chi.Router, d app.Deps) {
	if db, ok := d.DB.(interface {
		dal.Beginner
		dal.DBTX
	}); ok && d.Sessions != nil {
		mountUsers(r, admin.NewUserService(db, audit.New(audit.NewRepository()), d.Sessions))
	}
	if d.DB != nil {
		mountAudit(r, audit.NewReader(d.DB))
	}
}
