package assessments

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
)

var (
	// ErrSubmitNotFound means no such version for this owner (also when it
	// belongs to someone else, or is deleted).
	ErrSubmitNotFound = errors.New("assessments: version not found")
	// ErrSubmitNotLatest means a newer version exists, so this one is read-only.
	ErrSubmitNotLatest = errors.New("assessments: version is not the latest")
	// ErrNoCompleteIndicator means nothing can be scored (BR-09).
	ErrNoCompleteIndicator = errors.New("assessments: no complete indicator")
)

// Frozen is what a version was snapshotted with (BR-10); scoring reads
// nothing else.
type Frozen struct {
	ValueBaht  float64
	Start, End time.Time
	Score, RM  int
	RL         map[string]engine.Thresholds
	ImpactC    engine.ImpactTable
	ImpactT    engine.ImpactTable
}

// Complete is one complete indicator (BR-09), in the units it was answered.
type Complete struct {
	Code   string
	X      float64
	Y1, Y2 float64
	Y1Unit string
	Y2Unit string
	Y3     []string
}

// Scored is the engine outcome of one indicator with the converted inputs.
type Scored struct {
	Code  string
	Input engine.Input
	engine.Result
}

// ScoreAll converts units and scores every answer with the snapshot. The
// first failure ends it, so a caller can roll everything back.
func ScoreAll(f Frozen, answers []Complete) ([]Scored, error) {
	out := make([]Scored, 0, len(answers))
	for _, a := range answers {
		th, ok := f.RL[a.Code]
		if !ok {
			return nil, fmt.Errorf("assessments: %s: no snapshot thresholds", a.Code)
		}
		y1, err := CostToPct(a.Y1, a.Y1Unit, f.ValueBaht)
		if err != nil {
			return nil, fmt.Errorf("assessments: %s: %w", a.Code, err)
		}
		y2, err := TimeToPct(a.Y2, a.Y2Unit, f.Start, f.End)
		if err != nil {
			return nil, fmt.Errorf("assessments: %s: %w", a.Code, err)
		}
		in := engine.Input{X: a.X, Y1Pct: y1, Y2Pct: y2}
		for _, o := range a.Y3 {
			in.Y3 = append(in.Y3, engine.Option(o))
		}
		res, err := engine.Score(in, engine.Snapshot{
			Thresholds: th, ImpactC: f.ImpactC, ImpactT: f.ImpactT,
			ScoreDecimals: f.Score, RMDecimals: f.RM,
		})
		if err != nil {
			return nil, fmt.Errorf("assessments: %s: %w", a.Code, err)
		}
		out = append(out, Scored{Code: a.Code, Input: in, Result: res})
	}
	return out, nil
}

// SubmitResult is the outcome of a submit.
type SubmitResult struct {
	SubmittedAt time.Time
	Scored      int
	LevelCounts map[engine.RiskLevel]int
	AverageRM   float64
}

// SubmitService scores and stores a version.
type SubmitService struct{ tx dal.Beginner }

// NewSubmitService returns a SubmitService; a pgx pool satisfies tx.
func NewSubmitService(tx dal.Beginner) *SubmitService { return &SubmitService{tx: tx} }

// Submit scores every complete indicator of an owned, latest version with its
// snapshot and stores the results in one transaction: any failure rolls back
// the whole submit. Results are upserted so chosen strategies survive a
// resubmission; indicators no longer complete lose their result, and a
// strategy whose result dropped below H goes too.
func (s *SubmitService) Submit(ctx context.Context, owner, projectID, versionID uuid.UUID) (SubmitResult, error) {
	var res SubmitResult
	err := dal.WithTx(ctx, s.tx, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		v, err := q.LockSubmitVersion(ctx, sqlc.LockSubmitVersionParams{VersionID: versionID, ProjectID: projectID, OwnerID: owner})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrSubmitNotFound
		}
		if err != nil {
			return err
		}
		if !v.Latest {
			return ErrSubmitNotLatest
		}
		frozen, err := loadFrozen(ctx, q, versionID, v)
		if err != nil {
			return err
		}
		rows, err := q.ListCompleteAnswers(ctx, versionID)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return ErrNoCompleteIndicator
		}
		answers := make([]Complete, len(rows))
		for i, r := range rows {
			answers[i] = Complete{
				Code: r.IndicatorCode, X: r.X, Y1: r.Y1Value, Y2: r.Y2Value,
				Y1Unit: string(r.Y1Unit.CostUnit), Y2Unit: string(r.Y2Unit.TimeUnit), Y3: r.Y3,
			}
		}
		scored, err := ScoreAll(frozen, answers)
		if err != nil {
			return err
		}
		if res, err = store(ctx, q, versionID, scored, frozen.RM); err != nil {
			return err
		}
		if err := q.DeleteLowRiskStrategies(ctx, versionID); err != nil {
			return err
		}
		at, err := q.MarkVersionSubmitted(ctx, versionID)
		if err != nil {
			return err
		}
		res.SubmittedAt = *at
		return nil
	})
	if err != nil {
		if errors.Is(err, ErrSubmitNotFound) || errors.Is(err, ErrSubmitNotLatest) || errors.Is(err, ErrNoCompleteIndicator) {
			return SubmitResult{}, err
		}
		return SubmitResult{}, fmt.Errorf("assessments: submit: %w", err)
	}
	return res, nil
}

func store(ctx context.Context, q *sqlc.Queries, versionID uuid.UUID, scored []Scored, rmDecimals int) (SubmitResult, error) {
	res := SubmitResult{Scored: len(scored), LevelCounts: map[engine.RiskLevel]int{}}
	kept := make([]string, len(scored))
	var sum float64
	for i, r := range scored {
		kept[i] = r.Code
		sum += r.RM
		res.LevelCounts[r.Level]++
		if err := q.UpsertRiskResult(ctx, sqlc.UpsertRiskResultParams{
			VersionID: versionID, IndicatorCode: r.Code, X: r.Input.X,
			Y1Pct: r.Input.Y1Pct, Y2Pct: r.Input.Y2Pct, Rl: r.RL, RiC: r.RIC, RiT: r.RIT,
			RiE: r.RIE, RiMax: r.RIMax, Rm: r.RM, Level: sqlc.RiskLevel(r.Level),
		}); err != nil {
			return res, err
		}
		if err := q.DeleteResultAdvice(ctx, sqlc.DeleteResultAdviceParams{VersionID: versionID, IndicatorCode: r.Code}); err != nil {
			return res, err
		}
		for _, l := range r.Advice {
			if err := q.InsertResultAdvice(ctx, sqlc.InsertResultAdviceParams{
				VersionID: versionID, IndicatorCode: r.Code, List: sqlc.AdviceList(l),
			}); err != nil {
				return res, err
			}
		}
	}
	p := math.Pow10(rmDecimals)
	res.AverageRM = math.Round(sum/float64(len(scored))*p) / p
	return res, q.DeleteStaleResults(ctx, sqlc.DeleteStaleResultsParams{VersionID: versionID, Kept: kept})
}

func loadFrozen(ctx context.Context, q *sqlc.Queries, versionID uuid.UUID, v sqlc.LockSubmitVersionRow) (Frozen, error) {
	f := Frozen{
		ValueBaht: v.ValueBaht, Start: v.SnapStartDate.Time, End: v.SnapEndDate.Time,
		Score: int(v.SnapScoreDecimals), RM: int(v.SnapRmDecimals), RL: map[string]engine.Thresholds{},
	}
	rl, err := q.ListSnapshotRL(ctx, versionID)
	if err != nil {
		return f, err
	}
	for _, r := range rl {
		f.RL[r.IndicatorCode] = thresholdsFrom(num(r.A), num(r.B), num(r.C), num(r.D), num(r.E))
	}
	imp, err := q.ListSnapshotImpact(ctx, versionID)
	if err != nil {
		return f, err
	}
	for _, r := range imp {
		t := engine.ImpactTable{A: r.A, B: r.B, C: r.C, D: r.D, E: r.E}
		switch r.ImpactCode {
		case sqlc.ImpactCodeRIC:
			f.ImpactC = t
		case sqlc.ImpactCodeRIT:
			f.ImpactT = t
		}
	}
	return f, nil
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
