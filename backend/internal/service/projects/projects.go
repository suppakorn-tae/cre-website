// Package projects is the project service: create, read, edit, list with
// search, and soft delete (UC-05). Every method takes the owner id, which the
// handler reads from the session, and every query filters on it, so a project
// of another user is indistinguishable from a missing one (ErrNotFound).
package projects

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
)

// ErrNotFound is returned for a project that does not exist, is deleted or
// belongs to someone else.
var ErrNotFound = errors.New("projects: not found")

// ErrLimitReached means the owner already has the maximum number of live
// projects (MAX_PROJECTS_PER_USER, BR-27).
var ErrLimitReached = errors.New("projects: project limit reached")

// FieldError names one invalid field by JSON pointer and a stable code.
type FieldError struct {
	Field string
	Code  string
}

// ValidationError lists every invalid field of a request.
type ValidationError struct{ Fields []FieldError }

func (e *ValidationError) Error() string {
	parts := make([]string, len(e.Fields))
	for i, f := range e.Fields {
		parts[i] = f.Field + ": " + f.Code
	}
	return "projects: invalid: " + strings.Join(parts, ", ")
}

// nicknameUniqueIndex is the unique index on (owner_id, lower(nickname)) over
// live projects: one user cannot have two live projects with the same nickname,
// ignoring letter case. A deleted project frees its nickname.
const nicknameUniqueIndex = "project_owner_nickname_uq"

// codeDuplicate is the field error code of a nickname the owner already uses.
const codeDuplicate = "duplicate"

// mapNicknameTaken turns a unique violation on the nickname index into the
// field error on /nickname, so a duplicate (also one raced past the index)
// is a 422 and never a 500. Any other error passes through.
func mapNicknameTaken(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == nicknameUniqueIndex {
		return &ValidationError{Fields: []FieldError{{Field: "/nickname", Code: codeDuplicate}}}
	}
	return err
}

// Fields are the editable project fields. Dates are YYYY-MM-DD and ValueBaht
// is a decimal with at most two places, so no precision is lost on the way
// to numeric(15,2).
type Fields struct {
	Name        string
	Nickname    string
	IslandCode  string
	IslandOther *string
	TypeCode    string
	TypeOther   *string
	StartDate   string
	EndDate     string
	ValueBaht   string
	ProgressPct int
	Description *string
}

// Project is a stored project with its derived values.
type Project struct {
	Fields
	ID                  uuid.UUID
	ExpectedProgressPct int
	VersionCount        int
	LatestVersionNo     *int
	LatestVersionID     *uuid.UUID
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Nullable is an optional field of a patch that may also be set to null.
type Nullable struct {
	Set   bool
	Value *string
}

// Patch is a partial update. A nil pointer or an unset Nullable keeps the
// stored value.
type Patch struct {
	Name        *string
	Nickname    *string
	IslandCode  *string
	IslandOther Nullable
	TypeCode    *string
	TypeOther   Nullable
	StartDate   *string
	EndDate     *string
	ValueBaht   *string
	ProgressPct *int
	Description Nullable
}

// ListParams selects one page. Q is the raw search text.
type ListParams struct {
	Q        string
	Page     int
	PageSize int
}

// Page is one page of projects and the total number of matches.
type Page struct {
	Items []Project
	Total int
}

// Service holds the project use cases.
type Service struct {
	q        *sqlc.Queries
	tx       dal.Beginner
	rounding versions.Rounding
	now      func() time.Time
	// maxProjects is MAX_PROJECTS_PER_USER.
	maxProjects int
}

// New builds the service. db reads, tx runs the create transaction (a pool
// satisfies both) and rounding is the configured SCORE_DECIMALS/RM_DECIMALS
// frozen into the first version. now is the clock, time.Now in production.
func New(db dal.DBTX, tx dal.Beginner, rounding versions.Rounding, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{q: sqlc.New(db), tx: tx, rounding: rounding, now: now, maxProjects: config.DefaultMaxProjectsPerUser}
}

// WithLimit sets how many live projects one account may own (MAX_PROJECTS_PER_USER).
// A value below 1 keeps the current one.
func (s *Service) WithLimit(maxProjects int) *Service {
	if maxProjects >= 1 {
		s.maxProjects = maxProjects
	}
	return s
}

// MaxProjects is the number of live projects one account may own.
func (s *Service) MaxProjects() int { return s.maxProjects }

const dateLayout = "2006-01-02"

// Text limits in Unicode characters, the same as maxLength in the contract.
const (
	maxName        = 120
	maxOther       = 60
	maxDescription = 1000
)

var (
	islands      = set("koh_tao", "koh_samui", "koh_phangan", "koh_phi_phi", "koh_lanta", "koh_chang", "koh_kood", "other")
	projectTypes = set("building", "pier", "road", "utilities", "coastal", "other")
	maxValue     = big.NewRat(999999999999999, 100) // 9,999,999,999,999.99
)

func set(v ...string) map[string]bool {
	m := make(map[string]bool, len(v))
	for _, s := range v {
		m[s] = true
	}
	return m
}

// Create validates and stores a project for owner together with its first
// version, in one transaction: either both exist afterwards or neither does.
// The version is made by versions.CreateInTx, the code behind a new version.
func (s *Service) Create(ctx context.Context, owner uuid.UUID, in Fields) (Project, error) {
	in, err := validate(in)
	if err != nil {
		return Project{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return Project{}, fmt.Errorf("projects: new id: %w", err)
	}
	if s.tx == nil {
		return Project{}, errors.New("projects: create: no transaction source")
	}
	versionID, err := uuid.NewV7()
	if err != nil {
		return Project{}, fmt.Errorf("projects: new version id: %w", err)
	}
	err = dal.WithTx(ctx, s.tx, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		// Lock the owner row, then count: parallel creates run one by one.
		if _, err := q.LockProjectOwner(ctx, owner); err != nil {
			return err
		}
		n, err := q.CountLiveProjects(ctx, owner)
		if err != nil {
			return err
		}
		if int(n) >= s.maxProjects {
			return ErrLimitReached
		}
		if _, err := q.CreateProject(ctx, sqlc.CreateProjectParams{
			ID: id, OwnerID: owner, Name: in.Name, Nickname: in.Nickname,
			IslandCode: in.IslandCode, IslandOther: text(in.IslandOther),
			TypeCode: in.TypeCode, TypeOther: text(in.TypeOther),
			StartDate: date(in.StartDate), EndDate: date(in.EndDate),
			ValueBaht: in.ValueBaht, ProgressPct: int16(in.ProgressPct), //nolint:gosec // validated 0-100
			Description: text(in.Description),
		}); err != nil {
			return err
		}
		return versions.CreateInTx(ctx, tx, id, owner, versionID, s.rounding, 0)
	})
	if err != nil {
		return Project{}, fmt.Errorf("projects: create: %w", mapNicknameTaken(err))
	}
	return s.Get(ctx, owner, id)
}

// Get returns one of owner's projects.
func (s *Service) Get(ctx context.Context, owner, id uuid.UUID) (Project, error) {
	r, err := s.q.GetProject(ctx, sqlc.GetProjectParams{ID: id, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	if err != nil {
		return Project{}, fmt.Errorf("projects: get: %w", err)
	}
	return s.build(r.ID, r.Name, r.Nickname, r.IslandCode, r.IslandOther, r.TypeCode, r.TypeOther,
		r.StartDate, r.EndDate, r.ValueBaht, r.ProgressPct, r.Description, r.CreatedAt, r.UpdatedAt,
		r.VersionCount, r.LatestVersionNo, r.LatestVersionID), nil
}

// List returns one page of owner's projects, newest first, filtered by Q over
// name, nickname and island.
func (s *Service) List(ctx context.Context, owner uuid.UUID, p ListParams) (Page, error) {
	rows, err := s.q.ListProjects(ctx, sqlc.ListProjectsParams{
		OwnerID: owner, Q: likePattern(p.Q),
		PageLimit: int32(p.PageSize), PageOffset: int32((p.Page - 1) * p.PageSize), //nolint:gosec // bounded by the handler
	})
	if err != nil {
		return Page{}, fmt.Errorf("projects: list: %w", err)
	}
	out := Page{Items: make([]Project, 0, len(rows))}
	for _, r := range rows {
		out.Total = int(r.Total)
		out.Items = append(out.Items, s.build(r.ID, r.Name, r.Nickname, r.IslandCode, r.IslandOther, r.TypeCode,
			r.TypeOther, r.StartDate, r.EndDate, r.ValueBaht, r.ProgressPct, r.Description, r.CreatedAt,
			r.UpdatedAt, r.VersionCount, r.LatestVersionNo, r.LatestVersionID))
	}
	if len(rows) == 0 && p.Page > 1 {
		// A page past the end carries no total; ask for it on page one.
		first, err := s.q.ListProjects(ctx, sqlc.ListProjectsParams{
			OwnerID: owner, Q: likePattern(p.Q), PageLimit: 1,
		})
		if err != nil {
			return Page{}, fmt.Errorf("projects: list total: %w", err)
		}
		if len(first) > 0 {
			out.Total = int(first[0].Total)
		}
	}
	return out, nil
}

// Update applies patch to one of owner's projects and stores the result if
// it is valid as a whole. Changing a code away from "other" clears its
// free-text companion unless the patch sets it.
func (s *Service) Update(ctx context.Context, owner, id uuid.UUID, patch Patch) (Project, error) {
	cur, err := s.Get(ctx, owner, id)
	if err != nil {
		return Project{}, err
	}
	f := cur.Fields
	if patch.Name != nil {
		f.Name = *patch.Name
	}
	if patch.Nickname != nil {
		f.Nickname = *patch.Nickname
	}
	if patch.IslandCode != nil {
		f.IslandCode = *patch.IslandCode
		if f.IslandCode != "other" && !patch.IslandOther.Set {
			f.IslandOther = nil
		}
	}
	if patch.IslandOther.Set {
		f.IslandOther = patch.IslandOther.Value
	}
	if patch.TypeCode != nil {
		f.TypeCode = *patch.TypeCode
		if f.TypeCode != "other" && !patch.TypeOther.Set {
			f.TypeOther = nil
		}
	}
	if patch.TypeOther.Set {
		f.TypeOther = patch.TypeOther.Value
	}
	if patch.StartDate != nil {
		f.StartDate = *patch.StartDate
	}
	if patch.EndDate != nil {
		f.EndDate = *patch.EndDate
	}
	if patch.ValueBaht != nil {
		f.ValueBaht = *patch.ValueBaht
	}
	if patch.ProgressPct != nil {
		f.ProgressPct = *patch.ProgressPct
	}
	if patch.Description.Set {
		f.Description = patch.Description.Value
	}
	f, err = validate(f)
	if err != nil {
		return Project{}, err
	}
	n, err := s.q.UpdateProject(ctx, sqlc.UpdateProjectParams{
		ID: id, OwnerID: owner, Name: f.Name, Nickname: f.Nickname,
		IslandCode: f.IslandCode, IslandOther: text(f.IslandOther),
		TypeCode: f.TypeCode, TypeOther: text(f.TypeOther),
		StartDate: date(f.StartDate), EndDate: date(f.EndDate),
		ValueBaht: f.ValueBaht, ProgressPct: int16(f.ProgressPct), //nolint:gosec // validated 0-100
		Description: text(f.Description),
	})
	if err != nil {
		return Project{}, fmt.Errorf("projects: update: %w", mapNicknameTaken(err))
	}
	if n == 0 {
		return Project{}, ErrNotFound // deleted between read and write
	}
	return s.Get(ctx, owner, id)
}

// Delete soft-deletes one of owner's projects and all its versions.
func (s *Service) Delete(ctx context.Context, owner, id uuid.UUID) error {
	_, err := s.q.SoftDeleteProject(ctx, sqlc.SoftDeleteProjectParams{ID: id, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("projects: delete: %w", err)
	}
	return nil
}

func (s *Service) build(id uuid.UUID, name, nick, island string, islandOther pgtype.Text, typ string,
	typeOther pgtype.Text, start, end pgtype.Date, value string, progress int16, desc pgtype.Text,
	created, updated time.Time, versionCount, latest int32, latestID uuid.NullUUID,
) Project {
	p := Project{
		ID: id,
		Fields: Fields{
			Name: name, Nickname: nick, IslandCode: island, IslandOther: ptr(islandOther),
			TypeCode: typ, TypeOther: ptr(typeOther),
			StartDate: start.Time.Format(dateLayout), EndDate: end.Time.Format(dateLayout),
			ValueBaht: value, ProgressPct: int(progress), Description: ptr(desc),
		},
		ExpectedProgressPct: ExpectedProgress(start.Time, end.Time, s.now()),
		VersionCount:        int(versionCount),
		CreatedAt:           created, UpdatedAt: updated,
	}
	if latest > 0 {
		n := int(latest)
		p.LatestVersionNo = &n
	}
	if latestID.Valid {
		p.LatestVersionID = &latestID.UUID
	}
	return p
}

// bangkok is the calendar the project dates are read in.
var bangkok = time.FixedZone("ICT", 7*60*60)

// ExpectedProgress is the share of the project period that has elapsed on
// the day of now (Bangkok calendar), in whole percent, clamped to 0-100 and
// rounded half up (BR-24). It is computed on every read, never stored.
func ExpectedProgress(start, end, now time.Time) int {
	day := func(t time.Time) time.Time { return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC) }
	s, e := day(start), day(end)
	n := now.In(bangkok)
	today := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC)
	total := int64(e.Sub(s) / (24 * time.Hour))
	elapsed := int64(today.Sub(s) / (24 * time.Hour))
	switch {
	case total <= 0 || elapsed <= 0:
		return 0
	case elapsed >= total:
		return 100
	}
	return int((elapsed*200 + total) / (2 * total))
}

// likePattern turns search text into an ILIKE pattern, escaping wildcards.
// Empty text gives "" which the query reads as "no filter".
func likePattern(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}

// validate checks every rule and returns the fields in storage form (name and
// nickname trimmed, value normalised to two places). It collects all errors.
func validate(f Fields) (Fields, error) {
	var errs []FieldError
	bad := func(field, code string) { errs = append(errs, FieldError{"/" + field, code}) }

	f.Name = strings.TrimSpace(f.Name)
	switch n := utf8.RuneCountInString(f.Name); {
	case n == 0:
		bad("name", "required")
	case n > maxName:
		bad("name", "too_long")
	}
	f.Nickname = strings.TrimSpace(f.Nickname) // " KT2" and "KT2" are one nickname
	switch n := utf8.RuneCountInString(f.Nickname); {
	case n == 0:
		bad("nickname", "required")
	case n < 3:
		bad("nickname", "too_short")
	case n > 4:
		bad("nickname", "too_long")
	}
	if !islands[f.IslandCode] {
		bad("island_code", "invalid")
	}
	if !projectTypes[f.TypeCode] {
		bad("type_code", "invalid")
	}
	if islands[f.IslandCode] {
		checkOther(bad, "island_other", f.IslandCode == "other", f.IslandOther)
	}
	if projectTypes[f.TypeCode] {
		checkOther(bad, "type_other", f.TypeCode == "other", f.TypeOther)
	}

	start, serr := time.Parse(dateLayout, f.StartDate)
	end, eerr := time.Parse(dateLayout, f.EndDate)
	if f.StartDate == "" {
		bad("start_date", "required")
	} else if serr != nil {
		bad("start_date", "invalid")
	}
	if f.EndDate == "" {
		bad("end_date", "required")
	} else if eerr != nil {
		bad("end_date", "invalid")
	} else if serr == nil && !end.After(start) {
		bad("end_date", "must_be_after_start")
	}

	if f.ValueBaht == "" {
		bad("value_baht", "required")
	} else if v, ok := new(big.Rat).SetString(f.ValueBaht); !ok || strings.ContainsAny(f.ValueBaht, "/") {
		bad("value_baht", "invalid")
	} else if v.Sign() <= 0 {
		bad("value_baht", "must_be_positive")
	} else if v.Cmp(maxValue) > 0 {
		bad("value_baht", "out_of_range")
	} else if !new(big.Rat).Mul(v, big.NewRat(100, 1)).IsInt() {
		bad("value_baht", "too_many_decimals")
	} else {
		f.ValueBaht = v.FloatString(2)
	}

	if f.ProgressPct < 0 || f.ProgressPct > 100 {
		bad("progress_pct", "out_of_range")
	}
	if f.Description != nil && utf8.RuneCountInString(*f.Description) > maxDescription {
		bad("description", "too_long")
	}
	if len(errs) > 0 {
		return f, &ValidationError{Fields: errs}
	}
	if f.IslandOther != nil {
		t := strings.TrimSpace(*f.IslandOther)
		f.IslandOther = &t
	}
	if f.TypeOther != nil {
		t := strings.TrimSpace(*f.TypeOther)
		f.TypeOther = &t
	}
	return f, nil
}

// checkOther enforces that the free text is present exactly when the code
// is "other".
func checkOther(bad func(field, code string), field string, isOther bool, v *string) {
	switch {
	case isOther && (v == nil || strings.TrimSpace(*v) == ""):
		bad(field, "required")
	case !isOther && v != nil:
		bad(field, "not_allowed")
	case v != nil && utf8.RuneCountInString(*v) > maxOther:
		bad(field, "too_long")
	}
}

func text(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func ptr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}

// date converts an already validated YYYY-MM-DD string.
func date(s string) pgtype.Date {
	t, _ := time.Parse(dateLayout, s)
	return pgtype.Date{Time: t, Valid: true}
}
