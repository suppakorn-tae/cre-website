package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

// Impact is one shared impact table.
type Impact struct {
	Code      string // RI_C or RI_T
	Values    [5]float64
	UpdatedAt time.Time
}

// ImpactTables are both shared tables.
type ImpactTables struct{ RIC, RIT Impact }

// ImpactEdit is a request to change one or both tables; nil leaves a table
// unchanged.
type ImpactEdit struct{ RIC, RIT *[5]float64 }

// Impacts is the RI_C / RI_T part of the Admin Service.
type Impacts struct {
	db    dal.Beginner
	audit Recorder
	cache Invalidator
	log   *slog.Logger
}

// NewImpacts builds the service. db opens the edit transaction, rec writes
// the audit entries in it, and cache is invalidated after the commit.
func NewImpacts(db dal.Beginner, rec Recorder, cache Invalidator, log *slog.Logger) *Impacts {
	if log == nil {
		log = slog.Default()
	}
	return &Impacts{db: db, audit: rec, cache: cache, log: log}
}

// ValidateImpact checks one table: every value at least 0 and strictly
// increasing. field is the JSON pointer of the table in the request.
func ValidateImpact(field string, v [5]float64) error {
	var errs ValidationError
	for i, x := range v {
		if x < 0 {
			errs = append(errs, FieldError{Field: field + "/" + string(rune('a'+i)), Code: CodeNegative})
		}
	}
	if len(errs) > 0 {
		return errs
	}
	for i := 1; i < len(v); i++ {
		if v[i] <= v[i-1] {
			return ValidationError{{Field: field, Code: CodeInvalidOrder}}
		}
	}
	return nil
}

// Get returns both shared tables.
func (s *Impacts) Get(ctx context.Context) (ImpactTables, error) {
	db, ok := s.db.(dal.DBTX)
	if !ok {
		return ImpactTables{}, errors.New("admin: database handle cannot read")
	}
	rows, err := sqlc.New(db).AdminGetImpactTables(ctx)
	if err != nil {
		return ImpactTables{}, fmt.Errorf("admin: get impact tables: %w", err)
	}
	out := make([]Impact, len(rows))
	for i, r := range rows {
		out[i] = Impact{Code: string(r.Code), Values: [5]float64{r.A, r.B, r.C, r.D, r.E}, UpdatedAt: r.UpdatedAt}
	}
	return pairImpact(out)
}

// Update edits one or both tables in one transaction with one audit entry
// per table that changed, then invalidates the cache after the commit.
// Validation covers both tables before anything is written.
func (s *Impacts) Update(ctx context.Context, admin uuid.UUID, e ImpactEdit) (ImpactTables, error) {
	var errs ValidationError
	for _, t := range []struct {
		field string
		v     *[5]float64
	}{{"/ri_c", e.RIC}, {"/ri_t", e.RIT}} {
		if t.v == nil {
			continue
		}
		if err := ValidateImpact(t.field, *t.v); err != nil {
			errs = append(errs, err.(ValidationError)...)
		}
	}
	if len(errs) > 0 {
		return ImpactTables{}, errs
	}

	var changed bool
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		rows, err := q.AdminLockImpactTables(ctx)
		if err != nil {
			return fmt.Errorf("admin: lock impact tables: %w", err)
		}
		for _, r := range rows {
			var want *[5]float64
			switch r.Code {
			case sqlc.ImpactCodeRIC:
				want = e.RIC
			case sqlc.ImpactCodeRIT:
				want = e.RIT
			}
			old := [5]float64{r.A, r.B, r.C, r.D, r.E}
			if want == nil || *want == old {
				continue
			}
			err := q.AdminUpdateImpactTable(ctx, sqlc.AdminUpdateImpactTableParams{
				A: want[0], B: want[1], C: want[2], D: want[3], E: want[4],
				UpdatedBy: uuid.NullUUID{UUID: admin, Valid: true}, Code: r.Code,
			})
			if err != nil {
				return fmt.Errorf("admin: update impact table: %w", err)
			}
			changed = true
			if err := s.audit.Record(ctx, tx, audit.Entry{
				Action: audit.ImpactTableEdit, TargetType: "impact_table", TargetID: string(r.Code),
				Old: impactAudit(old), New: impactAudit(*want),
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return ImpactTables{}, err
	}
	if changed {
		// The edit is stored; a failure to reach other replicas is logged.
		if err := s.cache.Invalidate(context.WithoutCancel(ctx)); err != nil {
			s.log.WarnContext(ctx, "catalogue invalidation failed; other replicas may serve old impact tables", "error", err)
		}
	}
	return s.Get(ctx)
}

func impactAudit(v [5]float64) auditValues {
	return auditValues{A: &v[0], B: &v[1], C: &v[2], D: &v[3], E: &v[4]}
}

func pairImpact(rows []Impact) (ImpactTables, error) {
	var out ImpactTables
	var gotC, gotT bool
	for _, r := range rows {
		switch r.Code {
		case string(sqlc.ImpactCodeRIC):
			out.RIC, gotC = r, true
		case string(sqlc.ImpactCodeRIT):
			out.RIT, gotT = r, true
		}
	}
	if !gotC || !gotT {
		return ImpactTables{}, errors.New("admin: impact tables are not seeded")
	}
	return out, nil
}
