// Package assessments holds the assessment services. This file saves and
// reads the answers of one version: they are validated here and stored
// exactly as entered. Nothing is scored.
package assessments

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// MaxAnswerBatch is the most answers one request may carry (one per indicator).
const MaxAnswerBatch = 55

var (
	// ErrAnswerVersionNotFound means the version does not exist for this
	// owner (also when it belongs to someone else).
	ErrAnswerVersionNotFound = errors.New("assessments: version not found")
	// ErrAnswerNotEditable means a newer version exists, so this one is read-only.
	ErrAnswerNotEditable = errors.New("assessments: version is not editable")
)

// FieldError names one invalid field by JSON pointer.
type FieldError struct {
	Field string
	Code  string
}

// AnswerValidationError lists every invalid field of a request.
type AnswerValidationError struct{ Fields []FieldError }

func (e *AnswerValidationError) Error() string {
	return fmt.Sprintf("assessments: %d invalid answer field(s)", len(e.Fields))
}

// Impact is y1 (unit baht or percent) or y2 (unit day or percent).
type Impact struct {
	Value float64
	Unit  string
}

// AnswerInput is the full answer of one indicator. A nil field clears it.
type AnswerInput struct {
	IndicatorCode string
	X             *float64
	Y1            *Impact
	Y2            *Impact
	Y3            []string
}

// Answer is a stored answer.
type Answer struct {
	AnswerInput
	Complete  bool
	UpdatedAt time.Time
}

// AnswerList is every answer recorded for a version.
type AnswerList struct {
	VersionID uuid.UUID
	Editable  bool
	Items     []Answer
}

var indicatorPattern = regexp.MustCompile(`^[A-Z]{2}-[A-Z]{2}-[0-9]+$`)

// ValidateAnswers checks inputs and returns one FieldError per problem. The
// field pointers start with prefix(i), so a batch reports /answers/2/x and a
// single put reports /x.
func ValidateAnswers(in []AnswerInput, prefix func(i int) string) []FieldError {
	var errs []FieldError
	add := func(i int, path, code string) {
		errs = append(errs, FieldError{Field: prefix(i) + path, Code: code})
	}
	seen := map[string]bool{}
	for i, a := range in {
		switch {
		case !indicatorPattern.MatchString(a.IndicatorCode):
			add(i, "/indicator_code", "invalid_indicator_code")
		case seen[a.IndicatorCode]:
			add(i, "/indicator_code", "duplicate_indicator")
		}
		seen[a.IndicatorCode] = true
		if a.X != nil && *a.X < 0 {
			add(i, "/x", "out_of_range")
		}
		checkImpact(a.Y1, "/y1", "baht", i, add)
		checkImpact(a.Y2, "/y2", "day", i, add)
		checkY3(a.Y3, i, add)
	}
	return errs
}

func checkImpact(m *Impact, path, absolute string, i int, add func(int, string, string)) {
	if m == nil {
		return
	}
	switch {
	case m.Unit != absolute && m.Unit != "percent":
		add(i, path+"/unit", "invalid_unit")
	case m.Value < 0 || (m.Unit == "percent" && m.Value > 100):
		add(i, path+"/value", "out_of_range")
	}
}

func checkY3(opts []string, i int, add func(int, string, string)) {
	for j, o := range opts {
		if len(o) != 1 || o[0] < 'A' || o[0] > 'I' {
			add(i, "/y3/"+strconv.Itoa(j), "invalid_option")
		} else if slices.Index(opts, o) != j {
			add(i, "/y3/"+strconv.Itoa(j), "duplicate_option")
		}
	}
	if len(opts) > 1 && slices.Contains(opts, "A") {
		add(i, "/y3", "exclusive_option")
	}
}

// AnswerService saves and reads answers.
type AnswerService struct {
	db interface {
		dal.DBTX
		dal.Beginner
	}
}

// NewAnswerService builds the service on a pool.
func NewAnswerService(db interface {
	dal.DBTX
	dal.Beginner
},
) *AnswerService {
	return &AnswerService{db: db}
}

// List returns every answer of the version. A version of another owner is
// ErrAnswerVersionNotFound.
func (s *AnswerService) List(ctx context.Context, owner, projectID, versionID uuid.UUID) (AnswerList, error) {
	q := sqlc.New(s.db)
	editable, err := access(ctx, q, owner, projectID, versionID)
	if err != nil {
		return AnswerList{}, err
	}
	items, err := read(ctx, q, versionID, nil)
	if err != nil {
		return AnswerList{}, err
	}
	return AnswerList{VersionID: versionID, Editable: editable, Items: items}, nil
}

// Upsert validates and saves the answers, then returns them as stored. Each
// input replaces the stored answer of its indicator; others are untouched.
// Errors: ErrAnswerVersionNotFound, ErrAnswerNotEditable, *AnswerValidationError.
func (s *AnswerService) Upsert(
	ctx context.Context, owner, projectID, versionID uuid.UUID, in []AnswerInput, prefix func(i int) string,
) (AnswerList, error) {
	var out AnswerList
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		editable, err := access(ctx, q, owner, projectID, versionID)
		if err != nil {
			return err
		}
		if !editable {
			return ErrAnswerNotEditable
		}
		fields := ValidateAnswers(in, prefix)
		if len(fields) == 0 {
			fields, err = unknownIndicators(ctx, q, in, prefix)
			if err != nil {
				return err
			}
		}
		if len(fields) > 0 {
			return &AnswerValidationError{Fields: fields}
		}
		codes := make([]string, len(in))
		for i, a := range in {
			codes[i] = a.IndicatorCode
		}
		if err := saveAll(ctx, q, versionID, in); err != nil {
			return err
		}
		items, err := read(ctx, q, versionID, codes)
		out = AnswerList{VersionID: versionID, Editable: true, Items: items}
		return err
	})
	return out, err
}

func access(ctx context.Context, q *sqlc.Queries, owner, projectID, versionID uuid.UUID) (bool, error) {
	editable, err := q.GetAnswerVersionAccess(ctx, sqlc.GetAnswerVersionAccessParams{
		VersionID: versionID, ProjectID: projectID, OwnerID: owner,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrAnswerVersionNotFound
	}
	return editable, err
}

func unknownIndicators(ctx context.Context, q *sqlc.Queries, in []AnswerInput, prefix func(int) string) ([]FieldError, error) {
	codes := make([]string, len(in))
	for i, a := range in {
		codes[i] = a.IndicatorCode
	}
	known, err := q.ListExistingIndicatorCodes(ctx, codes)
	if err != nil {
		return nil, err
	}
	var fields []FieldError
	for i, c := range codes {
		if !slices.Contains(known, c) {
			fields = append(fields, FieldError{Field: prefix(i) + "/indicator_code", Code: "unknown_indicator"})
		}
	}
	return fields, nil
}

// saveAll writes the answers exactly as entered, in one statement per group:
// the answers, the removal of the stored y3 options, and the new y3 options.
// Decimals go to numeric as their shortest decimal text, so 0.1 is stored as
// 0.1. An empty string in a parallel array means NULL.
func saveAll(ctx context.Context, q *sqlc.Queries, versionID uuid.UUID, in []AnswerInput) error {
	if len(in) == 0 {
		return nil
	}
	n := len(in)
	p := sqlc.UpsertAnswersParams{
		VersionID: versionID, Codes: make([]string, n), X: make([]string, n),
		Y1Values: make([]string, n), Y1Units: make([]string, n),
		Y2Values: make([]string, n), Y2Units: make([]string, n),
	}
	var y3Codes, y3Options []string
	for i, a := range in {
		p.Codes[i] = a.IndicatorCode
		if a.X != nil {
			p.X[i] = decimal(*a.X)
		}
		if a.Y1 != nil {
			p.Y1Values[i], p.Y1Units[i] = decimal(a.Y1.Value), a.Y1.Unit
		}
		if a.Y2 != nil {
			p.Y2Values[i], p.Y2Units[i] = decimal(a.Y2.Value), a.Y2.Unit
		}
		for _, o := range a.Y3 {
			y3Codes = append(y3Codes, a.IndicatorCode)
			y3Options = append(y3Options, o)
		}
	}
	if err := q.UpsertAnswers(ctx, p); err != nil {
		return err
	}
	if err := q.DeleteAnswersY3(ctx, sqlc.DeleteAnswersY3Params{VersionID: versionID, Codes: p.Codes}); err != nil {
		return err
	}
	if len(y3Codes) == 0 {
		return nil
	}
	return q.InsertAnswersY3(ctx, sqlc.InsertAnswersY3Params{VersionID: versionID, Codes: y3Codes, Options: y3Options})
}

func decimal(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// read returns the stored answers of the version, only for codes when given.
func read(ctx context.Context, q *sqlc.Queries, versionID uuid.UUID, codes []string) ([]Answer, error) {
	rows, err := q.ListAnswers(ctx, versionID)
	if err != nil {
		return nil, err
	}
	y3Rows, err := q.ListAnswerY3(ctx, versionID)
	if err != nil {
		return nil, err
	}
	y3 := map[string][]string{}
	for _, r := range y3Rows {
		y3[r.IndicatorCode] = append(y3[r.IndicatorCode], strings.TrimSpace(r.OptionCode))
	}
	items := make([]Answer, 0, len(rows))
	for _, r := range rows {
		if codes != nil && !slices.Contains(codes, r.IndicatorCode) {
			continue
		}
		a := AnswerInput{IndicatorCode: r.IndicatorCode, Y3: y3[r.IndicatorCode], X: float(r.X)}
		if r.Y1Unit.Valid {
			a.Y1 = &Impact{Value: *float(r.Y1Value), Unit: string(r.Y1Unit.CostUnit)}
		}
		if r.Y2Unit.Valid {
			a.Y2 = &Impact{Value: *float(r.Y2Value), Unit: string(r.Y2Unit.TimeUnit)}
		}
		items = append(items, Answer{
			AnswerInput: a, UpdatedAt: r.UpdatedAt,
			Complete: a.X != nil && a.Y1 != nil && a.Y2 != nil && len(a.Y3) > 0,
		})
	}
	return items, nil
}

func float(n pgtype.Numeric) *float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return nil
	}
	return &f.Float64
}
