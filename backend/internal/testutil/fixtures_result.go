package testutil

import (
	"context"
	"testing"
)

// Result is a row of the risk_result table.
type Result struct {
	VersionID     string
	IndicatorCode string
	RL            string
	RIC, RIT, RIE string
	RM            string
	Level         string
}

// NewResult inserts a result for an answered indicator with a consistent
// ri_max and level (RL 3, RI_C 4, RI_T 2, RI_E 3, RM 4 = H by default).
func NewResult(t testing.TB, db DB, versionID, indicatorCode string, opts ...func(*Result)) Result {
	t.Helper()
	r := Result{
		VersionID: versionID, IndicatorCode: indicatorCode,
		RL: "3", RIC: "4", RIT: "2", RIE: "3", RM: "4", Level: "H",
	}
	for _, o := range opts {
		o(&r)
	}
	_, err := db.Exec(context.Background(), `
		INSERT INTO risk_result (version_id, indicator_code, x, y1_pct, y2_pct,
			rl, ri_c, ri_t, ri_e, ri_max, rm, level)
		VALUES ($1, $2, 10, 1, 4.1, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
			GREATEST($4::numeric, $5::numeric, $6::numeric), $7::numeric, $8::risk_level)`,
		r.VersionID, r.IndicatorCode, r.RL, r.RIC, r.RIT, r.RIE, r.RM, r.Level)
	must(t, err, "risk_result")
	return r
}

// SubmitVersion marks a draft version as submitted once.
func SubmitVersion(t testing.TB, db DB, versionID string) {
	t.Helper()
	_, err := db.Exec(context.Background(), `
		UPDATE assessment_version
		SET status = 'submitted', submission_no = 1, submitted_at = now(), progress_at_submit = 0
		WHERE id = $1`, versionID)
	must(t, err, "submit version")
}
