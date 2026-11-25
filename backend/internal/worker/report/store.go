package report

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	tmpl "github.com/suppakorn-tae/cre-website/backend/templates/report"
)

// locale is the catalogue locale of the report; th is the shipped default.
const locale = "th"

// ErrNoJob means the job has no report_job row.
var ErrNoJob = errors.New("report: no report job row")

// Store maps the read-only report_data queries onto the template data.
type Store struct{ q *sqlc.Queries }

// NewStore returns a Store over a pool, connection or transaction.
func NewStore(db dal.DBTX) *Store { return &Store{q: sqlc.New(db)} }

// Load returns the report data of a report job.
func (s *Store) Load(ctx context.Context, jobID uuid.UUID) (tmpl.Data, error) {
	h, err := s.q.ReportDataHead(ctx, jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return tmpl.Data{}, ErrNoJob
	}
	if err != nil {
		return tmpl.Data{}, fmt.Errorf("report: read project and version: %w", err)
	}
	d := tmpl.Data{
		ProjectName: h.Name, Nickname: h.Nickname,
		Island: h.IslandCode, IslandOther: h.IslandOther, Type: h.TypeCode, TypeOther: h.TypeOther,
		ValueBaht: h.ValueBaht, StartDate: h.SnapStartDate.Time, EndDate: h.SnapEndDate.Time,
		ProgressPct: int(h.ProgressPct), VersionNo: int(h.VersionNo),
		ScoreDecimals: int(h.ScoreDecimals), RMDecimals: int(h.RmDecimals),
	}
	if h.SubmittedAt != nil {
		d.SubmittedAt = *h.SubmittedAt
	}

	results, err := s.q.ReportDataResults(ctx, sqlc.ReportDataResultsParams{Locale: locale, VersionID: h.VersionID})
	if err != nil {
		return d, fmt.Errorf("report: read results: %w", err)
	}
	pos := make(map[string]int, len(results))
	for _, r := range results {
		pos[r.IndicatorCode] = len(d.Indicators)
		d.Indicators = append(d.Indicators, tmpl.Indicator{
			Code: r.IndicatorCode, Name: r.Name, RL: r.Rl, RIC: r.RiC, RIT: r.RiT, RIE: r.RiE,
			RIMax: r.RiMax, RM: r.Rm, Level: r.Level, Strategy: r.Strategy,
		})
	}

	advice, err := s.q.ReportDataAdvice(ctx, sqlc.ReportDataAdviceParams{Locale: locale, VersionID: h.VersionID})
	if err != nil {
		return d, fmt.Errorf("report: read advice: %w", err)
	}
	for _, a := range advice {
		ind := &d.Indicators[pos[a.IndicatorCode]]
		if n := len(ind.Advice); n == 0 || ind.Advice[n-1].List != a.List {
			ind.Advice = append(ind.Advice, tmpl.AdviceList{List: a.List})
		}
		last := &ind.Advice[len(ind.Advice)-1]
		last.Items = append(last.Items, a.Text)
	}
	return d, nil
}
