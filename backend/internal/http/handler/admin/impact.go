package admin

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

// ImpactService is what the handlers need from the Admin Service.
type ImpactService interface {
	Get(ctx context.Context) (svc.ImpactTables, error)
	Update(ctx context.Context, admin uuid.UUID, e svc.ImpactEdit) (svc.ImpactTables, error)
}

// MountImpact registers the impact table endpoints on r (mounted at /admin)
// behind auth and requireAdmin. Routes in routes.go calls it once a service
// can be built from app.Deps.
func MountImpact(r chi.Router, s ImpactService, auth, requireAdmin func(http.Handler) http.Handler) {
	h := impactHandler{s: s}
	r.Group(func(r chi.Router) {
		r.Use(auth, requireAdmin)
		r.Get("/impact-tables", h.get)
		r.Put("/impact-tables", h.update)
	})
}

type impactHandler struct{ s ImpactService }

func (h impactHandler) get(w http.ResponseWriter, r *http.Request) {
	t, err := h.s.Get(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeThresholdJSON(w, http.StatusOK, toImpact(t))
}

func (h impactHandler) update(w http.ResponseWriter, r *http.Request) {
	adminID, ok := adminFrom(w, r)
	if !ok {
		return
	}
	var req api.AdminUpdateImpactTablesRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.RiC == nil && req.RiT == nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "send ri_c, ri_t or both")
		return
	}
	t, err := h.s.Update(r.Context(), adminID, svc.ImpactEdit{RIC: impactIn(req.RiC), RIT: impactIn(req.RiT)})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeThresholdJSON(w, http.StatusOK, toImpact(t))
}

func impactIn(v *api.AdminImpactThresholdValues) *[5]float64 {
	if v == nil {
		return nil
	}
	in := [5]*float32{&v.A, &v.B, &v.C, &v.D, &v.E}
	var out [5]float64
	for i, p := range in {
		out[i] = *f64(p)
	}
	return &out
}

func toImpact(t svc.ImpactTables) api.AdminImpactTables {
	one := func(i svc.Impact) api.AdminImpactTable {
		v := i.Values
		return api.AdminImpactTable{
			Code: api.ImpactCode(i.Code),
			Thresholds: api.AdminImpactThresholdValues{
				A: float32(v[0]), B: float32(v[1]), C: float32(v[2]), D: float32(v[3]), E: float32(v[4]),
			},
			UpdatedAt: i.UpdatedAt.UTC(),
		}
	}
	return api.AdminImpactTables{RiC: one(t.RIC), RiT: one(t.RIT)}
}
