// Package compare is the Version Compare Service (UC-21, FR-45, FR-46,
// BR-26): two submitted versions side by side, the RM trend over all versions
// and the RM of each indicator per version. Figures come from stored
// risk_result rows; nothing is recalculated. Every method takes the owner id
// and sees only that account's non-deleted projects and versions.
package compare

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

var (
	// ErrNotFound means no such project or version for this owner (another
	// account's data, a version of another project and a deleted one included).
	ErrNotFound = errors.New("compare: not found")
	// ErrNotSubmitted means a requested version is still a draft.
	ErrNotSubmitted = errors.New("compare: version is not submitted")
	// ErrNoBase means no base was given and no earlier submitted version exists.
	ErrNoBase = errors.New("compare: no earlier submitted version")
	// ErrSameVersion means base and target are the same version.
	ErrSameVersion = errors.New("compare: base and target are the same version")
)

// Service reads the compare figures.
type Service struct {
	q *sqlc.Queries
}

// New returns a Service.
func New(db dal.DBTX) *Service {
	return &Service{q: sqlc.New(db)}
}

// Metrics are the figures of one submitted version. AvgRM is nil when no
// indicator is scored.
type Metrics struct {
	VersionID        uuid.UUID
	VersionNo        int
	SubmittedAt      time.Time
	ProgressAtSubmit int
	AvgRM            *float64
	HVhCount         int
	ScoredCount      int
}

// LevelChange is an indicator scored in both versions whose level changed.
// Up means the risk level rose from base to target.
type LevelChange struct {
	IndicatorCode, FactorCode string
	BaseLevel, TargetLevel    string
	BaseRM, TargetRM          float64
	Up                        bool
}

// Comparison is the result of Compare.
type Comparison struct {
	Base, Target       Metrics
	LevelUp, LevelDown int
	Changes            []LevelChange
}

// Levels is the number of scored indicators per risk level.
type Levels struct{ VL, L, M, H, VH int }

// TrendPoint is one version on the trend. A draft is an empty slot: only the
// identity and status are set, SubmittedAt, AvgRM, HVhCount and Levels are nil.
type TrendPoint struct {
	VersionID   uuid.UUID
	VersionNo   int
	Submitted   bool
	SubmittedAt *time.Time
	AvgRM       *float64
	HVhCount    *int
	Levels      *Levels
}

// RmVersion is a column of the RM matrix.
type RmVersion struct {
	VersionID uuid.UUID
	VersionNo int
	Submitted bool
}

// RmPoint is the RM of one indicator in one version; RM and Level are nil
// when the indicator is not scored there.
type RmPoint struct {
	VersionID uuid.UUID
	RM        *float64
	Level     *string
}

// RmRow is one indicator with a point per matrix version, in the same order.
type RmRow struct {
	IndicatorCode, FactorCode string
	Points                    []RmPoint
}

// RmMatrix is the result of IndicatorRM.
type RmMatrix struct {
	Versions   []RmVersion
	Indicators []RmRow
}

func (s *Service) owned(ctx context.Context, project, owner uuid.UUID) error {
	_, err := s.q.CompareProjectOwned(ctx, sqlc.CompareProjectOwnedParams{ID: project, OwnerID: owner})
	return mapErr(err)
}

func mapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func (s *Service) submitted(ctx context.Context, project, id, owner uuid.UUID) (Metrics, int32, error) {
	m, err := s.q.CompareVersionMetrics(ctx, sqlc.CompareVersionMetricsParams{ID: id, ProjectID: project, OwnerID: owner})
	if err != nil {
		return Metrics{}, 0, mapErr(err)
	}
	if m.Status != sqlc.VersionStatusSubmitted || m.SubmittedAt == nil {
		return Metrics{}, 0, ErrNotSubmitted
	}
	out := Metrics{
		VersionID: m.ID, VersionNo: int(m.VersionNo), SubmittedAt: *m.SubmittedAt,
		ProgressAtSubmit: int(m.ProgressAtSubmit), HVhCount: int(m.HVhCount), ScoredCount: int(m.ScoredCount),
	}
	if m.ScoredCount > 0 {
		out.AvgRM = &m.AvgRm
	}
	return out, m.VersionNo, nil
}

// Compare returns the figures of two submitted versions and the indicators
// whose level changed. A nil base means the submitted version before target.
func (s *Service) Compare(ctx context.Context, owner, project, target uuid.UUID, base *uuid.UUID) (Comparison, error) {
	t, targetNo, err := s.submitted(ctx, project, target, owner)
	if err != nil {
		return Comparison{}, err
	}
	var baseID uuid.UUID
	if base != nil {
		baseID = *base
	} else {
		baseID, err = s.q.ComparePreviousSubmitted(ctx, sqlc.ComparePreviousSubmittedParams{
			ProjectID: project, VersionNo: targetNo,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return Comparison{}, ErrNoBase
		}
		if err != nil {
			return Comparison{}, fmt.Errorf("compare: previous version: %w", err)
		}
	}
	if baseID == target {
		return Comparison{}, ErrSameVersion
	}
	b, _, err := s.submitted(ctx, project, baseID, owner)
	if err != nil {
		return Comparison{}, err
	}
	rows, err := s.q.CompareLevelChanges(ctx, sqlc.CompareLevelChangesParams{BaseID: baseID, TargetID: target})
	if err != nil {
		return Comparison{}, fmt.Errorf("compare: level changes: %w", err)
	}
	out := Comparison{Base: b, Target: t, Changes: make([]LevelChange, 0, len(rows))}
	for _, r := range rows {
		up := rank(r.TargetLevel) > rank(r.BaseLevel)
		if up {
			out.LevelUp++
		} else {
			out.LevelDown++
		}
		out.Changes = append(out.Changes, LevelChange{
			IndicatorCode: r.IndicatorCode, FactorCode: r.FactorCode,
			BaseLevel: string(r.BaseLevel), TargetLevel: string(r.TargetLevel),
			BaseRM: r.BaseRm, TargetRM: r.TargetRm, Up: up,
		})
	}
	return out, nil
}

func rank(l sqlc.RiskLevel) int {
	switch l {
	case sqlc.RiskLevelVL:
		return 1
	case sqlc.RiskLevelL:
		return 2
	case sqlc.RiskLevelM:
		return 3
	case sqlc.RiskLevelH:
		return 4
	default:
		return 5
	}
}

// Trend returns one point per non-deleted version, ascending by number.
func (s *Service) Trend(ctx context.Context, owner, project uuid.UUID) ([]TrendPoint, error) {
	if err := s.owned(ctx, project, owner); err != nil {
		return nil, err
	}
	rows, err := s.q.TrendPoints(ctx, sqlc.TrendPointsParams{ProjectID: project, OwnerID: owner})
	if err != nil {
		return nil, fmt.Errorf("compare: trend: %w", err)
	}
	out := make([]TrendPoint, 0, len(rows))
	for _, r := range rows {
		p := TrendPoint{VersionID: r.ID, VersionNo: int(r.VersionNo)}
		if r.Status == sqlc.VersionStatusSubmitted {
			p.Submitted = true
			p.SubmittedAt = r.SubmittedAt
			hvh := int(r.H + r.Vh)
			p.HVhCount = &hvh
			p.Levels = &Levels{VL: int(r.Vl), L: int(r.L), M: int(r.M), H: int(r.H), VH: int(r.Vh)}
			if r.Vl+r.L+r.M+r.H+r.Vh > 0 {
				p.AvgRM = &r.AvgRm
			}
		}
		out = append(out, p)
	}
	return out, nil
}

// IndicatorRM returns the RM of each indicator in every non-deleted version
// of the project. Drafts are columns with no values. Empty filters keep all;
// only indicators scored in at least one version appear.
func (s *Service) IndicatorRM(ctx context.Context, owner, project uuid.UUID, factors, indicators []string) (RmMatrix, error) {
	if err := s.owned(ctx, project, owner); err != nil {
		return RmMatrix{}, err
	}
	tp, err := s.q.TrendPoints(ctx, sqlc.TrendPointsParams{ProjectID: project, OwnerID: owner})
	if err != nil {
		return RmMatrix{}, fmt.Errorf("compare: versions: %w", err)
	}
	if factors == nil {
		factors = []string{}
	}
	if indicators == nil {
		indicators = []string{}
	}
	vals, err := s.q.IndicatorRmValues(ctx, sqlc.IndicatorRmValuesParams{
		ProjectID: project, OwnerID: owner, FactorCodes: factors, IndicatorCodes: indicators,
	})
	if err != nil {
		return RmMatrix{}, fmt.Errorf("compare: indicator rm: %w", err)
	}
	out := RmMatrix{Versions: make([]RmVersion, len(tp)), Indicators: []RmRow{}}
	col := make(map[uuid.UUID]int, len(tp))
	for i, v := range tp {
		col[v.ID] = i
		out.Versions[i] = RmVersion{VersionID: v.ID, VersionNo: int(v.VersionNo), Submitted: v.Status == sqlc.VersionStatusSubmitted}
	}
	row := map[string]int{}
	for _, v := range vals {
		i, ok := row[v.IndicatorCode]
		if !ok {
			i = len(out.Indicators)
			row[v.IndicatorCode] = i
			pts := make([]RmPoint, len(tp))
			for c, ver := range out.Versions {
				pts[c] = RmPoint{VersionID: ver.VersionID}
			}
			out.Indicators = append(out.Indicators, RmRow{IndicatorCode: v.IndicatorCode, FactorCode: v.FactorCode, Points: pts})
		}
		rm, lvl := v.Rm, string(v.Level)
		out.Indicators[i].Points[col[v.VersionID]] = RmPoint{VersionID: v.VersionID, RM: &rm, Level: &lvl}
	}
	return out, nil
}
