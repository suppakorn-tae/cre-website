// Package projects holds the projects HTTP handlers.
package projects

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/projects"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
)

// Defaults for SCORE_DECIMALS and RM_DECIMALS when Deps carries none.
const (
	defaultScoreDecimals = 2
	defaultRMDecimals    = 3
)

// Routes registers the projects endpoints under /projects. Every route needs
// a session; the owner is always the signed-in account.
func Routes(r chi.Router, d app.Deps) {
	rounding := d.Rounding
	if rounding == (versions.Rounding{}) {
		rounding = versions.Rounding{ScoreDecimals: defaultScoreDecimals, RMDecimals: defaultRMDecimals}
	}
	tx, _ := d.DB.(dal.Beginner) // nil in router tests without a pool; create then answers 500
	h := &handler{svc: projects.New(d.DB, tx, rounding, nil), owner: sessionOwner}
	r.Group(func(r chi.Router) {
		if d.Auth != nil {
			r.Use(d.Auth)
		}
		r.Get("/", h.list)
		r.Post("/", h.create)
		r.Get("/{project_id}", h.get)
		r.Patch("/{project_id}", h.update)
		r.Delete("/{project_id}", h.delete)
	})
}
