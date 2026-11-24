package catalogue

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
)

const cacheControl = "private, no-cache"

var localeRE = regexp.MustCompile(`^[a-z]{2}$`)

// Islands and project types are fixed lists of codes; the labels live in the
// web message catalogue. `other` is last.
var (
	islandCodes = []string{
		"koh_samui", "koh_phangan", "koh_tao", "koh_phi_phi", "koh_lanta", "koh_chang", "koh_kood", "other",
	}
	projectTypeCodes = []string{"building", "road", "pier", "coastal", "utilities", "other"}
)

// Source is the part of the catalogue service the handlers use.
type Source interface {
	Snapshot(ctx context.Context) (*svc.Snapshot, error)
}

// Handler serves the catalogue, island and project type endpoints.
type Handler struct {
	src          Source
	islandsTag   string
	typesTag     string
	islandsBody  api.IslandList
	typesBody    api.ProjectTypeList
	serverHandle api.ServerInterface
}

// strictAdapter exposes only the three catalogue operations of the generated
// strict interface. The embedded nil interface covers the rest, which are
// never routed here.
type strictAdapter struct {
	api.StrictServerInterface
	h *Handler
}

func (a strictAdapter) GetCatalogue(ctx context.Context, r api.GetCatalogueRequestObject) (api.GetCatalogueResponseObject, error) {
	return a.h.GetCatalogue(ctx, r)
}

func (a strictAdapter) ListIslands(ctx context.Context, r api.ListIslandsRequestObject) (api.ListIslandsResponseObject, error) {
	return a.h.ListIslands(ctx, r)
}

func (a strictAdapter) ListProjectTypes(ctx context.Context, r api.ListProjectTypesRequestObject) (api.ListProjectTypesResponseObject, error) {
	return a.h.ListProjectTypes(ctx, r)
}

// New builds a Handler over the catalogue service.
func New(src Source) *Handler {
	h := &Handler{src: src}
	for _, c := range islandCodes {
		h.islandsBody.Items = append(h.islandsBody.Items, api.IslandOption{Code: c})
	}
	for _, c := range projectTypeCodes {
		h.typesBody.Items = append(h.typesBody.Items, api.ProjectTypeOption{Code: c})
	}
	h.islandsTag = etag("islands", strings.Join(islandCodes, ","))
	h.typesTag = etag("project-types", strings.Join(projectTypeCodes, ","))
	h.serverHandle = api.NewStrictHandlerWithOptions(strictAdapter{h: h}, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
			middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "Bad request")
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "Internal error")
		},
	})
	return h
}

// MountCatalogue registers GET / for a router mounted at /api/v1/catalogue.
func (h *Handler) MountCatalogue(r chi.Router) {
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		p := api.GetCatalogueParams{IfNoneMatch: ifNoneMatch(req)}
		if l := req.URL.Query().Get("locale"); l != "" {
			p.Locale = &l
		}
		h.serverHandle.GetCatalogue(w, req, p)
	})
}

// MountLookups registers GET /islands and GET /project-types for a router
// mounted at /api/v1. They are not under /catalogue in the contract.
func (h *Handler) MountLookups(r chi.Router) {
	r.Get("/islands", func(w http.ResponseWriter, req *http.Request) {
		h.serverHandle.ListIslands(w, req, api.ListIslandsParams{IfNoneMatch: ifNoneMatch(req)})
	})
	r.Get("/project-types", func(w http.ResponseWriter, req *http.Request) {
		h.serverHandle.ListProjectTypes(w, req, api.ListProjectTypesParams{IfNoneMatch: ifNoneMatch(req)})
	})
}

func ifNoneMatch(r *http.Request) *string {
	if v := r.Header.Get("If-None-Match"); v != "" {
		return &v
	}
	return nil
}

// GetCatalogue implements GET /catalogue.
func (h *Handler) GetCatalogue(ctx context.Context, req api.GetCatalogueRequestObject) (api.GetCatalogueResponseObject, error) {
	locale := svc.DefaultLocale
	if req.Params.Locale != nil && localeRE.MatchString(*req.Params.Locale) {
		locale = *req.Params.Locale
	}
	snap, err := h.src.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	tag := etag(snap.Version(), locale)
	if matches(req.Params.IfNoneMatch, tag) {
		return api.GetCatalogue304Response{Headers: api.GetCatalogue304ResponseHeaders{ETag: &tag}}, nil
	}
	cc := cacheControl
	return api.GetCatalogue200JSONResponse{
		Body:    toCatalogue(snap, locale),
		Headers: api.GetCatalogue200ResponseHeaders{ETag: &tag, CacheControl: &cc},
	}, nil
}

// ListIslands implements GET /islands.
func (h *Handler) ListIslands(_ context.Context, req api.ListIslandsRequestObject) (api.ListIslandsResponseObject, error) {
	tag := h.islandsTag
	if matches(req.Params.IfNoneMatch, tag) {
		return api.ListIslands304Response{Headers: api.ListIslands304ResponseHeaders{ETag: &tag}}, nil
	}
	cc := cacheControl
	return api.ListIslands200JSONResponse{
		Body:    h.islandsBody,
		Headers: api.ListIslands200ResponseHeaders{ETag: &tag, CacheControl: &cc},
	}, nil
}

// ListProjectTypes implements GET /project-types.
func (h *Handler) ListProjectTypes(_ context.Context, req api.ListProjectTypesRequestObject) (api.ListProjectTypesResponseObject, error) {
	tag := h.typesTag
	if matches(req.Params.IfNoneMatch, tag) {
		return api.ListProjectTypes304Response{Headers: api.ListProjectTypes304ResponseHeaders{ETag: &tag}}, nil
	}
	cc := cacheControl
	return api.ListProjectTypes200JSONResponse{
		Body:    h.typesBody,
		Headers: api.ListProjectTypes200ResponseHeaders{ETag: &tag, CacheControl: &cc},
	}, nil
}

func toCatalogue(s *svc.Snapshot, locale string) api.Catalogue {
	out := api.Catalogue{
		Locale:     locale,
		Dimensions: make([]api.CatalogueDimension, 0, len(s.Dimensions)),
		RiEOptions: make([]api.RiEOption, 0, len(s.RiEOptions)),
	}
	for _, d := range s.Dimensions {
		dim := api.CatalogueDimension{Code: d.Code, Name: d.Name.In(locale), Factors: []api.CatalogueFactor{}}
		for _, f := range d.Factors {
			fac := api.CatalogueFactor{Code: f.Code, Name: f.Name.In(locale), Indicators: []api.CatalogueIndicator{}}
			for _, i := range f.Indicators {
				fac.Indicators = append(fac.Indicators, api.CatalogueIndicator{
					Code: i.Code, Name: i.Name.In(locale), Unit: i.Unit.In(locale),
					QuestionX: i.QuestionX.Ptr(locale), QuestionY1: i.QuestionY1.Ptr(locale),
					QuestionY2: i.QuestionY2.Ptr(locale), QuestionY3: i.QuestionY3.Ptr(locale),
				})
			}
			dim.Factors = append(dim.Factors, fac)
		}
		out.Dimensions = append(out.Dimensions, dim)
	}
	for _, o := range s.RiEOptions {
		out.RiEOptions = append(out.RiEOptions, api.RiEOption{
			Code: o.Code, Label: o.Label.In(locale), IsExclusive: o.IsExclusive,
		})
	}
	return out
}

// etag builds a strong validator from its parts.
func etag(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return `"` + hex.EncodeToString(sum[:8]) + `"`
}

// matches reports whether an If-None-Match header lists tag (weak
// comparison, as RFC 9110 requires for If-None-Match) or is `*`.
func matches(header *string, tag string) bool {
	if header == nil {
		return false
	}
	for _, c := range strings.Split(*header, ",") {
		c = strings.TrimPrefix(strings.TrimSpace(c), "W/")
		if c == "*" || c == tag {
			return true
		}
	}
	return false
}
