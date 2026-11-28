package projects

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/projects"
)

const maxBody = 1 << 20

type handler struct {
	svc *projects.Service
	// owner returns the account id of the caller. In production it reads the
	// session principal; it never reads the request body or path.
	owner func(*http.Request) (uuid.UUID, bool)
}

func sessionOwner(r *http.Request) (uuid.UUID, bool) {
	p, ok := middleware.PrincipalFrom(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(p.AccountID)
	return id, err == nil
}

// begin returns the owner, or answers 401.
func (h *handler) begin(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, ok := h.owner(r)
	if !ok {
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
	}
	return id, ok
}

// projectID parses the path id. A malformed id is a missing project.
func projectID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "project_id"))
	if err != nil {
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "project not found")
		return uuid.Nil, false
	}
	return id, true
}

func (h *handler) list(w http.ResponseWriter, r *http.Request) {
	owner, ok := h.begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	page, pageSize := 1, 20
	if !intParam(q.Get("page"), 1, 1<<20, &page) || !intParam(q.Get("page_size"), 1, 100, &pageSize) {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "invalid page, page_size or q")
		return
	}
	if len([]rune(q.Get("q"))) > 200 {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "q is longer than 200 characters")
		return
	}
	res, err := h.svc.List(r.Context(), owner, projects.ListParams{Q: q.Get("q"), Page: page, PageSize: pageSize})
	if err != nil {
		h.fail(w, r, err)
		return
	}
	out := wireList{Items: make([]wireProject, len(res.Items)), Page: page, PageSize: pageSize, Total: res.Total}
	for i, p := range res.Items {
		out.Items[i] = toAPI(p)
	}
	out.MaxProjects = h.svc.MaxProjects()
	writeJSON(w, http.StatusOK, out)
}

// intParam parses an optional integer query value within [lo, hi].
func intParam(s string, lo, hi int, dst *int) bool {
	if s == "" {
		return true
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < lo || n > hi {
		return false
	}
	*dst = n
	return true
}

// createBody decodes with exact decimals: value_baht stays text.
type createBody struct {
	Name        string      `json:"name"`
	Nickname    string      `json:"nickname"`
	IslandCode  string      `json:"island_code"`
	IslandOther *string     `json:"island_other"`
	TypeCode    string      `json:"type_code"`
	TypeOther   *string     `json:"type_other"`
	StartDate   string      `json:"start_date"`
	EndDate     string      `json:"end_date"`
	ValueBaht   decimalText `json:"value_baht"`
	ProgressPct int         `json:"progress_pct"`
	Description *string     `json:"description"`
}

// decimalText keeps a JSON number as its source text.
type decimalText string

func (d *decimalText) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return nil
	}
	if len(b) == 0 || b[0] == '"' {
		return errors.New("value_baht must be a number")
	}
	*d = decimalText(b)
	return nil
}

func (h *handler) create(w http.ResponseWriter, r *http.Request) {
	owner, ok := h.begin(w, r)
	if !ok {
		return
	}
	var in createBody
	if !decode(w, r, &in) {
		return
	}
	p, err := h.svc.Create(r.Context(), owner, projects.Fields{
		Name: in.Name, Nickname: in.Nickname, IslandCode: in.IslandCode, IslandOther: in.IslandOther,
		TypeCode: in.TypeCode, TypeOther: in.TypeOther, StartDate: in.StartDate, EndDate: in.EndDate,
		ValueBaht: string(in.ValueBaht), ProgressPct: in.ProgressPct, Description: in.Description,
	})
	if err != nil {
		h.fail(w, r, err)
		return
	}
	w.Header().Set("Location", r.URL.Path+"/"+p.ID.String())
	writeJSON(w, http.StatusCreated, toAPI(p))
}

func (h *handler) get(w http.ResponseWriter, r *http.Request) {
	owner, ok := h.begin(w, r)
	if !ok {
		return
	}
	id, ok := projectID(w, r)
	if !ok {
		return
	}
	p, err := h.svc.Get(r.Context(), owner, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(p))
}

func (h *handler) update(w http.ResponseWriter, r *http.Request) {
	owner, ok := h.begin(w, r)
	if !ok {
		return
	}
	id, ok := projectID(w, r)
	if !ok {
		return
	}
	patch, ok := decodePatch(w, r)
	if !ok {
		return
	}
	p, err := h.svc.Update(r.Context(), owner, id, patch)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toAPI(p))
}

func (h *handler) delete(w http.ResponseWriter, r *http.Request) {
	owner, ok := h.begin(w, r)
	if !ok {
		return
	}
	id, ok := projectID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), owner, id); err != nil {
		h.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodePatch reads a partial update. Absent keys keep the stored value, an
// explicit null clears the nullable fields, and an unknown key, a wrong type
// or an empty object is a 400.
func decodePatch(w http.ResponseWriter, r *http.Request) (projects.Patch, bool) {
	var raw map[string]json.RawMessage
	if !decode(w, r, &raw) {
		return projects.Patch{}, false
	}
	if len(raw) == 0 {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "send at least one field")
		return projects.Patch{}, false
	}
	var (
		p        projects.Patch
		firstErr error
	)
	str := func(dst **string, key string) {
		if v, ok := raw[key]; ok {
			delete(raw, key)
			var s string
			if err := json.Unmarshal(v, &s); err != nil && firstErr == nil {
				firstErr = errors.New(key + " must be a string")
				return
			}
			*dst = &s
		}
	}
	nullable := func(dst *projects.Nullable, key string) {
		if v, ok := raw[key]; ok {
			delete(raw, key)
			var s *string
			if err := json.Unmarshal(v, &s); err != nil && firstErr == nil {
				firstErr = errors.New(key + " must be a string or null")
				return
			}
			*dst = projects.Nullable{Set: true, Value: s}
		}
	}
	str(&p.Name, "name")
	str(&p.Nickname, "nickname")
	str(&p.IslandCode, "island_code")
	nullable(&p.IslandOther, "island_other")
	str(&p.TypeCode, "type_code")
	nullable(&p.TypeOther, "type_other")
	str(&p.StartDate, "start_date")
	str(&p.EndDate, "end_date")
	nullable(&p.Description, "description")
	if v, ok := raw["value_baht"]; ok {
		delete(raw, "value_baht")
		var d decimalText
		if err := json.Unmarshal(v, &d); err != nil || d == "" {
			firstErr = errors.New("value_baht must be a number")
		} else {
			s := string(d)
			p.ValueBaht = &s
		}
	}
	if v, ok := raw["progress_pct"]; ok {
		delete(raw, "progress_pct")
		var n int
		if err := json.Unmarshal(v, &n); err != nil {
			firstErr = errors.New("progress_pct must be an integer")
		} else {
			p.ProgressPct = &n
		}
	}
	for k := range raw {
		firstErr = errors.New("unknown field " + k)
	}
	if firstErr != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", firstErr.Error())
		return projects.Patch{}, false
	}
	return p, true
}

// decode reads one JSON value of at most 1 MiB into dst or answers 400.
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err == nil {
		dec := json.NewDecoder(bytes.NewReader(b))
		if err = dec.Decode(dst); err == nil && dec.More() {
			err = errors.New("trailing data")
		}
	}
	if err != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body must be one valid JSON object")
		return false
	}
	return true
}

func (h *handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var ve *projects.ValidationError
	switch {
	case errors.Is(err, projects.ErrNotFound):
		middleware.WriteError(w, r, http.StatusNotFound, "not_found", "project not found")
	case errors.Is(err, projects.ErrLimitReached):
		middleware.WriteError(w, r, http.StatusConflict, "project_limit_reached", "project limit reached")
	case errors.As(err, &ve):
		fields := make([]api.FieldError, len(ve.Fields))
		for i, f := range ve.Fields {
			fields[i] = api.FieldError{Field: f.Field, Code: f.Code}
		}
		rid := log.RequestID(r.Context())
		writeJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
			Code: "validation_failed", Message: "one or more fields are invalid", Fields: fields, RequestId: &rid,
		}})
	default:
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "project request failed")
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// wireProject is Project with value_baht as an exact JSON number (the
// generated type uses float32, which cannot hold 15 digits).
type wireProject struct {
	api.Project
	ValueBaht json.Number `json:"value_baht"`
}

type wireList struct {
	Items    []wireProject `json:"items"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
	Total    int           `json:"total"`
	// MaxProjects is MAX_PROJECTS_PER_USER.
	MaxProjects int `json:"max_projects"`
}

func toAPI(p projects.Project) wireProject {
	date := func(s string) openapi_types.Date {
		var d openapi_types.Date
		_ = d.UnmarshalText([]byte(s))
		return d
	}
	return wireProject{
		Project: api.Project{
			Id: p.ID, Name: p.Name, Nickname: p.Nickname,
			IslandCode: api.ProjectIsland(p.IslandCode), IslandOther: p.IslandOther,
			TypeCode: api.ProjectType(p.TypeCode), TypeOther: p.TypeOther,
			StartDate: date(p.StartDate), EndDate: date(p.EndDate),
			ProgressPct: p.ProgressPct, Description: p.Description,
			ExpectedProgressPct: p.ExpectedProgressPct, VersionCount: p.VersionCount,
			LatestVersionNo: p.LatestVersionNo, LatestVersionId: p.LatestVersionID,
			CreatedAt: p.CreatedAt.UTC(), UpdatedAt: p.UpdatedAt.UTC(),
		},
		ValueBaht: json.Number(p.ValueBaht),
	}
}
