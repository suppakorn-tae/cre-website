package report

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	tmpl "github.com/suppakorn-tae/cre-website/backend/templates/report"
)

// locale is the catalogue locale of the report; th is the shipped default.
const locale = "th"

// ErrNoJob means the job has no report_job row.
var ErrNoJob = errors.New("report: no report job row")

// Store reads report data with plain read-only SQL over stored results. The
// worker needs no write path here, and the queries live with the report
// builder because only this package uses them.
type Store struct{ db dal.DBTX }

// NewStore returns a Store over a pool, connection or transaction.
func NewStore(db dal.DBTX) *Store { return &Store{db: db} }

const headSQL = `
SELECT v.id, v.version_no, v.submitted_at, COALESCE(v.progress_at_submit, 0)::int,
    v.snap_score_decimals::int, v.snap_rm_decimals::int,
    v.snap_value_baht::float8, v.snap_start_date, v.snap_end_date,
    p.name, p.nickname, p.island_code, COALESCE(p.island_other, ''),
    p.type_code, COALESCE(p.type_other, '')
FROM report_job r
JOIN assessment_version v ON v.id = r.version_id
JOIN project p ON p.id = v.project_id
WHERE r.job_id = $1`

const resultsSQL = `
SELECT rr.indicator_code, it.name, rr.rl::float8, rr.ri_c::float8, rr.ri_t::float8,
    rr.ri_e::float8, rr.ri_max::float8, rr.rm::float8, rr.level::text,
    COALESCE(sc.strategy::text, '')
FROM risk_result rr
JOIN indicator i ON i.code = rr.indicator_code
JOIN factor f ON f.code = i.factor_code
JOIN indicator_text it ON it.indicator_code = i.code AND it.locale = $2
LEFT JOIN strategy_choice sc
    ON sc.version_id = rr.version_id AND sc.indicator_code = rr.indicator_code
WHERE rr.version_id = $1
ORDER BY f.sort_no, i.f_code`

// Advice is read for the lists stored with the result (which lists apply is
// decided at submit time) and only for H and VH.
const adviceSQL = `
SELECT ral.indicator_code, ral.list::text, t.text
FROM result_advice_list ral
JOIN risk_result rr
    ON rr.version_id = ral.version_id AND rr.indicator_code = ral.indicator_code
JOIN advice_item ai ON ai.indicator_code = ral.indicator_code AND ai.list = ral.list
JOIN advice_item_text t ON t.item_id = ai.id AND t.locale = $2
WHERE ral.version_id = $1 AND rr.level IN ('H', 'VH')
ORDER BY ral.indicator_code, ral.list, ai.position`

// Load returns the report data of a report job.
func (s *Store) Load(ctx context.Context, jobID uuid.UUID) (tmpl.Data, error) {
	var d tmpl.Data
	var versionID uuid.UUID
	err := s.db.QueryRow(ctx, headSQL, jobID).Scan(&versionID, &d.VersionNo, &d.SubmittedAt,
		&d.ProgressPct, &d.ScoreDecimals, &d.RMDecimals, &d.ValueBaht, &d.StartDate, &d.EndDate,
		&d.ProjectName, &d.Nickname, &d.Island, &d.IslandOther, &d.Type, &d.TypeOther)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNoJob
	}
	if err != nil {
		return d, fmt.Errorf("report: read project and version: %w", err)
	}

	rows, err := s.db.Query(ctx, resultsSQL, versionID, locale)
	if err != nil {
		return d, fmt.Errorf("report: read results: %w", err)
	}
	pos := map[string]int{}
	for rows.Next() {
		var i tmpl.Indicator
		if err := rows.Scan(&i.Code, &i.Name, &i.RL, &i.RIC, &i.RIT, &i.RIE, &i.RIMax, &i.RM,
			&i.Level, &i.Strategy); err != nil {
			rows.Close()
			return d, fmt.Errorf("report: scan result: %w", err)
		}
		pos[i.Code] = len(d.Indicators)
		d.Indicators = append(d.Indicators, i)
	}
	if err := rows.Err(); err != nil {
		return d, fmt.Errorf("report: read results: %w", err)
	}

	rows, err = s.db.Query(ctx, adviceSQL, versionID, locale)
	if err != nil {
		return d, fmt.Errorf("report: read advice: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var code, list, text string
		if err := rows.Scan(&code, &list, &text); err != nil {
			return d, fmt.Errorf("report: scan advice: %w", err)
		}
		ind := &d.Indicators[pos[code]]
		if n := len(ind.Advice); n == 0 || ind.Advice[n-1].List != list {
			ind.Advice = append(ind.Advice, tmpl.AdviceList{List: list})
		}
		last := &ind.Advice[len(ind.Advice)-1]
		last.Items = append(last.Items, text)
	}
	if err := rows.Err(); err != nil {
		return d, fmt.Errorf("report: read advice: %w", err)
	}
	return d, nil
}
