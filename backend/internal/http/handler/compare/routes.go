package compare

import (
	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/compare"
)

// Routes registers the compare endpoints on r, which must be the /projects
// router. It does nothing when the database or the session middleware is
// missing (tests that build bare Deps). router.go does not call it yet: see
// the wiring note in the pull request.
func Routes(r chi.Router, d app.Deps) {
	if d.DB == nil || d.Auth == nil {
		return
	}
	Mount(r, svc.New(d.DB), d.Auth)
}
