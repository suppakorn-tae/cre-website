// Package results returns the stored results of a submitted version and saves
// the strategy chosen for each H or VH indicator (UC-09, UC-10). Results are
// read as stored: nothing is recalculated, so the engine is never called
// here. Advice text is not stored with a result; only the selected lists are,
// so an admin edit shows on the next read without a resubmission.
package results

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

// DefaultLocale is the locale every advice item has; other locales fall back
// to it.
const DefaultLocale = "th"

var (
	// ErrNotFound means no such submitted version or result for this owner.
	// Another account's data, admins included, looks absent.
	ErrNotFound = errors.New("results: not found")
	// ErrNotLatest means the version is not the latest, so it is read only.
	ErrNotLatest = errors.New("results: version is not the latest")
	// ErrNotHighRisk means the indicator is not H or VH, so it takes no
	// strategy.
	ErrNotHighRisk = errors.New("results: indicator is not high risk")
	// ErrInvalidStrategy means the strategy is not one of the four.
	ErrInvalidStrategy = errors.New("results: invalid strategy")
)

// Strategies are the values a user can choose (FR-27).
var Strategies = []string{"REDUCE", "TRANSFER", "AVOID", "ACCEPT"}

// Advice is one selected list with the current text of its items.
type Advice struct {
	List  string
	Items []string
}

// Indicator is the stored result of one indicator.
type Indicator struct {
	Code                         string
	X, Y1Pct, Y2Pct              float64
	RL, RIC, RIT, RIE, RIMax, RM float64
	Level                        string
	Advice                       []Advice
	Strategy                     *string
	StrategyUpdatedAt            *time.Time
}

// Results is what a submission stored, with counts per level.
type Results struct {
	VersionID   uuid.UUID
	SubmittedAt time.Time
	Editable    bool
	AverageRM   float64
	LevelCounts map[string]int
	Items       []Indicator
}

// Choice is a saved strategy.
type Choice struct {
	IndicatorCode string
	Strategy      string
	UpdatedAt     time.Time
}

// Service holds the results use cases.
type Service struct {
	db dal.DBTX
}

// New returns a Service reading and writing through db.
func New(db dal.DBTX) *Service { return &Service{db: db} }

// Get returns the stored results of a submitted version of an owned project.
// Advice items use locale, falling back to DefaultLocale.
func (s *Service) Get(ctx context.Context, projectID, versionID, owner uuid.UUID, locale string) (Results, error) {
	q := sqlc.New(s.db)
	v, err := q.GetResultsVersion(ctx, sqlc.GetResultsVersionParams{VersionID: versionID, ProjectID: projectID, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && v.SubmittedAt == nil) {
		return Results{}, ErrNotFound
	}
	if err != nil {
		return Results{}, fmt.Errorf("results: get version: %w", err)
	}
	rows, err := q.ListStoredResults(ctx, versionID)
	if err != nil {
		return Results{}, fmt.Errorf("results: list results: %w", err)
	}
	texts, err := q.ListResultAdvice(ctx, sqlc.ListResultAdviceParams{Locale: locale, VersionID: versionID})
	if err != nil {
		return Results{}, fmt.Errorf("results: list advice: %w", err)
	}
	advice := groupAdvice(texts)

	out := Results{
		VersionID: v.ID, SubmittedAt: *v.SubmittedAt, Editable: v.Editable, AverageRM: v.AverageRm,
		LevelCounts: map[string]int{"VL": 0, "L": 0, "M": 0, "H": 0, "VH": 0},
		Items:       make([]Indicator, len(rows)),
	}
	for i, r := range rows {
		it := Indicator{
			Code: r.IndicatorCode, X: r.X, Y1Pct: r.Y1Pct, Y2Pct: r.Y2Pct,
			RL: r.Rl, RIC: r.RiC, RIT: r.RiT, RIE: r.RiE, RIMax: r.RiMax, RM: r.Rm,
			Level: string(r.Level), Advice: advice[r.IndicatorCode], StrategyUpdatedAt: r.StrategyUpdatedAt,
		}
		if r.Strategy.Valid {
			st := string(r.Strategy.RiskStrategy)
			it.Strategy = &st
		}
		out.LevelCounts[it.Level]++
		out.Items[i] = it
	}
	return out, nil
}

// groupAdvice folds the ordered rows into lists per indicator.
func groupAdvice(rows []sqlc.ListResultAdviceRow) map[string][]Advice {
	out := map[string][]Advice{}
	for _, r := range rows {
		lists := out[r.IndicatorCode]
		if n := len(lists); n > 0 && lists[n-1].List == string(r.List) {
			lists[n-1].Items = append(lists[n-1].Items, r.Text)
		} else {
			lists = append(lists, Advice{List: string(r.List), Items: []string{r.Text}})
		}
		out[r.IndicatorCode] = lists
	}
	return out
}

// SetStrategy saves the strategy of an H or VH indicator of the latest
// version. It is ErrNotFound for a version or indicator the owner cannot see,
// ErrNotLatest for an older version and ErrNotHighRisk below H.
func (s *Service) SetStrategy(ctx context.Context, projectID, versionID, owner uuid.UUID, code, strategy string) (Choice, error) {
	if !validStrategy(strategy) {
		return Choice{}, ErrInvalidStrategy
	}
	q := sqlc.New(s.db)
	lv, err := q.GetResultLevel(ctx, sqlc.GetResultLevelParams{
		VersionID: versionID, IndicatorCode: code, ProjectID: projectID, OwnerID: owner,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Choice{}, ErrNotFound
	}
	if err != nil {
		return Choice{}, fmt.Errorf("results: get level: %w", err)
	}
	if !lv.Editable {
		return Choice{}, ErrNotLatest
	}
	if lv.Level != sqlc.RiskLevelH && lv.Level != sqlc.RiskLevelVH {
		return Choice{}, ErrNotHighRisk
	}
	row, err := q.UpsertStrategy(ctx, sqlc.UpsertStrategyParams{
		VersionID: versionID, IndicatorCode: code, Strategy: sqlc.RiskStrategy(strategy),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Choice{}, ErrNotLatest // a newer version appeared since the check
	}
	if err != nil {
		return Choice{}, fmt.Errorf("results: save strategy: %w", err)
	}
	return Choice{IndicatorCode: row.IndicatorCode, Strategy: string(row.Strategy), UpdatedAt: row.UpdatedAt}, nil
}

func validStrategy(s string) bool {
	for _, v := range Strategies {
		if s == v {
			return true
		}
	}
	return false
}
