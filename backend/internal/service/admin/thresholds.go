package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

// ErrIndicatorNotFound means no such indicator.
var ErrIndicatorNotFound = errors.New("admin: indicator not found")

// FieldError names one invalid field by JSON pointer.
type FieldError struct {
	Field string
	Code  string
}

// ValidationError lists every invalid field of a request (HTTP 422).
type ValidationError []FieldError

func (v ValidationError) Error() string { return fmt.Sprintf("admin: %d invalid fields", len(v)) }

// Field error codes.
const (
	CodeNegative       = "negative"
	CodeInvalidPattern = "invalid_pattern"
	CodeInvalidOrder   = "invalid_order"
)

// Recorder writes an audit entry on the caller's transaction.
type Recorder interface {
	Record(ctx context.Context, tx dal.DBTX, e audit.Entry) error
}

// Invalidator drops the catalogue cache on every replica.
type Invalidator interface {
	Invalidate(ctx context.Context) error
}

// Values are the thresholds a–e; nil is an unused threshold.
type Values struct {
	A, B, C, D, E *float64
}

// auditValues is the audited form of Values.
type auditValues struct {
	A *float64 `json:"a"`
	B *float64 `json:"b"`
	C *float64 `json:"c"`
	D *float64 `json:"d"`
	E *float64 `json:"e"`
}

func (v Values) audit() auditValues { return auditValues(v) }

func (v Values) slots() [5]*float64 { return [5]*float64{v.A, v.B, v.C, v.D, v.E} }

func (v Values) equal(o Values) bool {
	a, b := v.slots(), o.slots()
	for i := range a {
		if (a[i] == nil) != (b[i] == nil) || (a[i] != nil && *a[i] != *b[i]) {
			return false
		}
	}
	return true
}

// RLThreshold is one indicator's thresholds.
type RLThreshold struct {
	IndicatorCode string
	Unit          string
	Direction     engine.Direction
	Values        Values
	UpdatedAt     time.Time
}

// Thresholds is the thresholds part of the Admin Service.
type Thresholds struct {
	db    dal.Beginner
	audit Recorder
	cache Invalidator
	log   *slog.Logger
}

// NewThresholds builds the service. db opens the edit transaction, rec writes
// the audit entries in it, and cache is invalidated after the commit.
func NewThresholds(db dal.Beginner, rec Recorder, cache Invalidator, log *slog.Logger) *Thresholds {
	if log == nil {
		log = slog.Default()
	}
	return &Thresholds{db: db, audit: rec, cache: cache, log: log}
}

// reader is the pool for plain reads: a Beginner is also a DBTX in practice.
func (s *Thresholds) reader() (dal.DBTX, error) {
	r, ok := s.db.(dal.DBTX)
	if !ok {
		return nil, errors.New("admin: database handle cannot read")
	}
	return r, nil
}

// ListRL returns the thresholds of every indicator.
func (s *Thresholds) ListRL(ctx context.Context) ([]RLThreshold, error) {
	db, err := s.reader()
	if err != nil {
		return nil, err
	}
	rows, err := sqlc.New(db).AdminListRlThresholds(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin: list rl thresholds: %w", err)
	}
	out := make([]RLThreshold, len(rows))
	for i, r := range rows {
		out[i] = RLThreshold{
			IndicatorCode: r.Code, Unit: r.Unit, Direction: engine.Direction(r.Direction),
			Values: fromNumerics(r.A, r.B, r.C, r.D, r.E), UpdatedAt: r.UpdatedAt,
		}
	}
	return out, nil
}

// GetRL returns one indicator's thresholds, or ErrIndicatorNotFound.
func (s *Thresholds) GetRL(ctx context.Context, code string) (RLThreshold, error) {
	db, err := s.reader()
	if err != nil {
		return RLThreshold{}, err
	}
	return s.getRL(ctx, db, code)
}

func (s *Thresholds) getRL(ctx context.Context, db dal.DBTX, code string) (RLThreshold, error) {
	r, err := sqlc.New(db).AdminGetRlThreshold(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return RLThreshold{}, ErrIndicatorNotFound
	}
	if err != nil {
		return RLThreshold{}, fmt.Errorf("admin: get rl threshold: %w", err)
	}
	return RLThreshold{
		IndicatorCode: r.Code, Unit: r.Unit, Direction: engine.Direction(r.Direction),
		Values: fromNumerics(r.A, r.B, r.C, r.D, r.E), UpdatedAt: r.UpdatedAt,
	}, nil
}

// ValidateRL checks v for an indicator of direction dir: values at least 0,
// then the pattern and order rules of the engine, so the catalogue and the
// scoring can never disagree. It returns a ValidationError or nil.
func ValidateRL(dir engine.Direction, v Values) error {
	var errs ValidationError
	for i, p := range v.slots() {
		if p != nil && *p < 0 {
			errs = append(errs, FieldError{Field: "/thresholds/" + string(rune('a'+i)), Code: CodeNegative})
		}
	}
	if len(errs) > 0 {
		return errs
	}
	_, err := engine.ScoreRL(0, engine.Thresholds{A: v.A, B: v.B, C: v.C, D: v.D, E: v.E, Direction: dir})
	switch {
	case errors.Is(err, engine.ErrInvalidPattern):
		return ValidationError{{Field: "/thresholds", Code: CodeInvalidPattern}}
	case errors.Is(err, engine.ErrInvalidOrder):
		return ValidationError{{Field: "/thresholds", Code: CodeInvalidOrder}}
	case err != nil:
		return fmt.Errorf("admin: validate rl thresholds: %w", err)
	}
	return nil
}

// UpdateRL replaces one indicator's thresholds. It validates, writes the row
// and one audit entry in a single transaction, and invalidates the catalogue
// cache after the commit. An unchanged save writes nothing.
func (s *Thresholds) UpdateRL(ctx context.Context, admin uuid.UUID, code string, v Values) (RLThreshold, error) {
	var changed bool
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		cur, err := q.AdminLockRlThreshold(ctx, code)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrIndicatorNotFound
		}
		if err != nil {
			return fmt.Errorf("admin: lock indicator: %w", err)
		}
		if err := ValidateRL(engine.Direction(cur.Direction), v); err != nil {
			return err
		}
		old := fromNumerics(cur.A, cur.B, cur.C, cur.D, cur.E)
		if old.equal(v) {
			return nil
		}
		err = q.AdminUpdateRlThreshold(ctx, sqlc.AdminUpdateRlThresholdParams{
			A: float8(v.A), B: float8(v.B), C: float8(v.C), D: float8(v.D), E: float8(v.E),
			UpdatedBy: uuid.NullUUID{UUID: admin, Valid: true}, Code: code,
		})
		if err != nil {
			return fmt.Errorf("admin: update indicator: %w", err)
		}
		changed = true
		return s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.RLThresholdEdit, TargetType: "indicator", TargetID: code,
			Old: old.audit(), New: v.audit(),
		})
	})
	if err != nil {
		return RLThreshold{}, err
	}
	if changed {
		s.invalidate(ctx)
	}
	return s.GetRL(ctx, code)
}

// invalidate runs after the commit. The edit is already stored, so a failure
// to reach other replicas is logged rather than returned.
func (s *Thresholds) invalidate(ctx context.Context) {
	if err := s.cache.Invalidate(context.WithoutCancel(ctx)); err != nil {
		s.log.WarnContext(ctx, "catalogue invalidation failed; other replicas may serve old thresholds", "error", err)
	}
}

func fromNumerics(a, b, c, d, e pgtype.Numeric) Values {
	return Values{A: num(a), B: num(b), C: num(c), D: num(d), E: num(e)}
}

func num(n pgtype.Numeric) *float64 {
	if !n.Valid {
		return nil
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return nil
	}
	return &f.Float64
}

func float8(p *float64) pgtype.Float8 {
	if p == nil {
		return pgtype.Float8{}
	}
	return pgtype.Float8{Float64: *p, Valid: true}
}
