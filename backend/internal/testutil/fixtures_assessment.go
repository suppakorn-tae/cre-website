package testutil

import (
	"context"
	"testing"
)

// Version is a row of the assessment_version table.
type Version struct {
	ID        string
	ProjectID string
	No        int
}

// NewVersionWithSnapshot inserts the next draft version of a project with
// its complete snapshot: the project value and dates, every indicator's RL
// thresholds and both impact tables, as the create-version path does.
func NewVersionWithSnapshot(t testing.TB, db DB, projectID string) Version {
	t.Helper()
	ctx := context.Background()
	v := Version{ID: NewID(), ProjectID: projectID}
	err := db.QueryRow(ctx, `
		INSERT INTO assessment_version (id, project_id, version_no, snap_value_baht,
			snap_start_date, snap_end_date, snap_score_decimals, snap_rm_decimals)
		SELECT $1, p.id,
			COALESCE((SELECT max(version_no) FROM assessment_version WHERE project_id = p.id), 0) + 1,
			p.value_baht, p.start_date, p.end_date, 2, 2
		FROM project p WHERE p.id = $2
		RETURNING version_no`, v.ID, projectID).Scan(&v.No)
	must(t, err, "assessment_version")
	_, err = db.Exec(ctx, `
		INSERT INTO version_rl_threshold (version_id, indicator_code, a, b, c, d, e)
		SELECT $1, code, a, b, c, d, e FROM indicator`, v.ID)
	must(t, err, "version_rl_threshold")
	_, err = db.Exec(ctx, `
		INSERT INTO version_impact_threshold (version_id, impact_code, a, b, c, d, e)
		SELECT $1, code, a, b, c, d, e FROM impact_table`, v.ID)
	must(t, err, "version_impact_threshold")
	return v
}

// Answer is a complete answer: X, y1 in baht, y2 in days and ticked y3 options.
type Answer struct {
	VersionID     string
	IndicatorCode string
	X, Y1, Y2     string
	Y3            []string
}

// NewAnswer inserts a complete answer for an indicator of the version.
func NewAnswer(t testing.TB, db DB, versionID, indicatorCode string, opts ...func(*Answer)) Answer {
	t.Helper()
	a := Answer{VersionID: versionID, IndicatorCode: indicatorCode, X: "10", Y1: "1000000", Y2: "30", Y3: []string{"B"}}
	for _, o := range opts {
		o(&a)
	}
	ctx := context.Background()
	_, err := db.Exec(ctx, `
		INSERT INTO answer (version_id, indicator_code, x, y1_value, y1_unit, y2_value, y2_unit)
		VALUES ($1, $2, $3, $4, 'baht', $5, 'day')`,
		a.VersionID, a.IndicatorCode, a.X, a.Y1, a.Y2)
	must(t, err, "answer")
	for _, o := range a.Y3 {
		_, err = db.Exec(ctx, `INSERT INTO answer_y3 VALUES ($1, $2, $3)`, a.VersionID, a.IndicatorCode, o)
		must(t, err, "answer_y3")
	}
	return a
}
