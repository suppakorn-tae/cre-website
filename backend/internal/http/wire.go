package http

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/catalogue"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/compare"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/results"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/versions"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svcadmin "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	svcassess "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	svccat "github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
	svccompare "github.com/suppakorn-tae/cre-website/backend/internal/service/compare"
	svcexport "github.com/suppakorn-tae/cre-website/backend/internal/service/export"
	svcjobs "github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	svcreports "github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
	svcresults "github.com/suppakorn-tae/cre-website/backend/internal/service/results"
	svcversions "github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
)

// Defaults for SCORE_DECIMALS and RM_DECIMALS when cmd/api passes none.
const (
	defaultScoreDecimals = 2
	defaultRMDecimals    = 3
)

// Rate limit of POST .../reports: report requests per account.
const (
	reportRequestLimit  = 10
	reportRequestWindow = 10 * time.Minute
)

// wiring builds the services of the feature handlers that router.go mounts.
// Every field is nil when its dependency is missing (router tests build bare
// Deps), and the routes that need it are then left out.
type wiring struct {
	d        Deps
	db       dal.DBTX
	begin    dal.Beginner
	catalog  *svccat.Service
	versions *svcversions.Service
	reports  *svcreports.Service
	export   *svcexport.Service
}

func newWiring(d Deps) wiring {
	w := wiring{d: d, db: d.DB}
	if d.DB == nil || d.Auth == nil {
		return w
	}
	w.begin, _ = d.DB.(dal.Beginner)
	if w.begin == nil {
		return w
	}
	w.catalog = d.Catalogue
	if w.catalog == nil {
		w.catalog = newCatalogue(d)
	}
	r := d.Rounding
	if r == (svcversions.Rounding{}) {
		r = svcversions.Rounding{ScoreDecimals: defaultScoreDecimals, RMDecimals: defaultRMDecimals}
	}
	w.versions = svcversions.New(d.DB, w.begin, r).WithLimit(d.Config.MaxVersionsPerProject)
	if pool, ok := d.DB.(svcjobs.Pool); ok && d.FileStore != nil && d.Enqueuer != nil {
		jobs := svcjobs.New(pool, d.Enqueuer)
		w.reports = svcreports.New(d.DB, w.begin, jobs, d.FileStore, d.Logger)
		w.export = svcexport.New(d.DB, w.begin, jobs, audit.New(audit.NewRepository()), d.FileStore, d.Logger)
	}
	return w
}

// newCatalogue builds a catalogue service without the invalidation listener.
// cmd/api passes one that has been started, so edits on another replica reach
// this one; without it only this process's own edits drop the cache.
func newCatalogue(d Deps) *svccat.Service {
	tx, ok := d.DB.(svccat.TxBeginner)
	ps, ok2 := d.Valkey.(valkey.PubSub)
	if !ok || !ok2 {
		return nil
	}
	return svccat.New(svccat.PGRepository{DB: tx}, ps, d.Logger)
}

// lookups mounts the catalogue endpoints that live outside /catalogue.
func (w wiring) lookups(r chi.Router) {
	if w.catalog == nil {
		return
	}
	catalogue.New(w.catalog).MountLookups(r.With(w.d.Auth))
}

func (w wiring) catalogueRoutes(r chi.Router) {
	if w.catalog == nil {
		return
	}
	catalogue.New(w.catalog).MountCatalogue(r.With(w.d.Auth))
}

// projectRoutes adds the routes under /projects/{project_id}/... that belong
// to other domains: versions, answers' neighbours, results, submit, reports.
func (w wiring) projectRoutes(r chi.Router) {
	if w.versions == nil {
		return
	}
	auth := w.d.Auth
	versions.Mount(r, w.versions, auth)
	results.Mount(r, svcresults.New(w.db), auth)
	compare.Mount(r, svccompare.New(w.db), auth)
	assessments.MountSubmit(r, svcassess.NewSubmitService(w.begin), auth)
	if w.reports != nil {
		limit := w.rateLimit("RL_REPORT_REQUEST", reportRequestLimit, reportRequestWindow, keyAccount)
		r.With(auth, limit).Post("/{project_id}/versions/{version_id}/reports", reports.Request(w.reports))
	}
}

// answerRoutes mounts the answer endpoints, which spell out their full
// /projects/... path, so r is the /api/v1 root.
func (w wiring) answerRoutes(r chi.Router) {
	if w.versions != nil {
		assessments.MountAnswers(r, svcassess.NewAnswerService(w.d.DB.(interface {
			dal.DBTX
			dal.Beginner
		})), w.d.Auth)
	}
}

func (w wiring) reportRoutes(r chi.Router) {
	if w.reports != nil {
		reports.Mount(r, w.reports, w.d.Auth)
	}
}

// adminRoutes adds the admin editors. The caller mounts r behind Auth and
// RequireAdmin already, so the handlers get pass-through guards here.
func (w wiring) adminRoutes(r chi.Router) {
	if w.catalog == nil {
		return
	}
	rec := audit.New(audit.NewRepository())
	log := w.d.Logger
	if log == nil {
		log = slog.Default()
	}
	admin.MountThresholds(r, svcadmin.NewThresholds(w.begin, rec, w.catalog, log), app.PassThrough, app.PassThrough)
	admin.MountImpact(r, svcadmin.NewImpacts(w.begin, rec, w.catalog, log), app.PassThrough, app.PassThrough)
	if w.export != nil {
		admin.MountExport(r, w.export, app.PassThrough, app.PassThrough)
	}
	if db, ok := w.d.DB.(svcadmin.DB); ok {
		admin.MountAdvice(r, svcadmin.NewAdviceService(db, rec, w.catalog))
	}
}

func (w wiring) rateLimit(prefix string, limit int, window time.Duration, key middleware.KeyFunc) app.Middleware {
	if w.d.RateLimit == nil { // Deps built without WireAuth (router tests)
		return app.PassThrough
	}
	return w.d.RateLimit(prefix, limit, window, key)
}

// keyAccount rate-limits by the signed-in account.
func keyAccount(r *http.Request) string {
	p, _ := middleware.PrincipalFrom(r.Context())
	return p.AccountID
}
