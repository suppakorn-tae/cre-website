package testutil_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func constraint(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.ConstraintName
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func TestSubmittedVersionWithResults(t *testing.T) {
	db := testutil.NewDB(t)
	ctx := context.Background()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}

	owner := testutil.NewAccount(t, db)
	p := testutil.NewProject(t, db, owner.ID)
	v := testutil.NewVersionWithSnapshot(t, db, p.ID)
	if v.No != 1 {
		t.Fatalf("version_no = %d", v.No)
	}
	if v2 := testutil.NewVersionWithSnapshot(t, db, p.ID); v2.No != 2 {
		t.Fatalf("second version_no = %d", v2.No)
	}

	var n int
	must(db.QueryRow(ctx, `SELECT count(*) FROM version_rl_threshold WHERE version_id = $1`, v.ID).Scan(&n))
	if n != 55 {
		t.Fatalf("rl snapshot rows = %d, want 55", n)
	}
	must(db.QueryRow(ctx, `SELECT count(*) FROM version_impact_threshold WHERE version_id = $1`, v.ID).Scan(&n))
	if n != 2 {
		t.Fatalf("impact snapshot rows = %d, want 2", n)
	}

	var code string
	must(db.QueryRow(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code))
	testutil.NewAnswer(t, db, v.ID, code)
	testutil.NewResult(t, db, v.ID, code)
	testutil.SubmitVersion(t, db, v.ID)
	_, err := db.Exec(ctx, `INSERT INTO result_advice_list VALUES ($1, $2, 'RL'), ($1, $2, 'RI_C')`, v.ID, code)
	must(err)
	_, err = db.Exec(ctx, `INSERT INTO strategy_choice (version_id, indicator_code, strategy) VALUES ($1, $2, 'REDUCE')`, v.ID, code)
	must(err)

	// report_job references the version.
	jobID := testutil.NewID()
	_, err = db.Exec(ctx, `INSERT INTO job (id, kind, requested_by) VALUES ($1, 'report', $2)`, jobID, owner.ID)
	must(err)
	_, err = db.Exec(ctx, `INSERT INTO report_job (job_id, version_id, submission_no) VALUES ($1, $2, 1)`, jobID, v.ID)
	must(err)
	_, err = db.Exec(ctx, `INSERT INTO report_job (job_id, version_id, submission_no) VALUES ($1, $2, 1)`, jobID, testutil.NewID())
	if err == nil {
		t.Fatal("report_job with unknown version must fail")
	}
	_, err = db.Exec(ctx, `DELETE FROM assessment_version WHERE id = $1`, v.ID)
	if err == nil {
		t.Fatal("deleting a referenced version must fail")
	}

	// Cascade: deleting the result removes its advice lists and strategy.
	_, err = db.Exec(ctx, `DELETE FROM risk_result WHERE version_id = $1`, v.ID)
	must(err)
	must(db.QueryRow(ctx, `SELECT (SELECT count(*) FROM result_advice_list) + (SELECT count(*) FROM strategy_choice)`).Scan(&n))
	if n != 0 {
		t.Fatalf("children after cascade = %d", n)
	}
	// Deleting an answer that still has a result is restricted.
	testutil.NewResult(t, db, v.ID, code)
	_, err = db.Exec(ctx, `DELETE FROM answer WHERE version_id = $1`, v.ID)
	if got := constraint(err); got != "risk_result_answer_fk" {
		t.Fatalf("delete answer: constraint %q", got)
	}
}

func TestChecks(t *testing.T) {
	db := testutil.NewDB(t)
	ctx := context.Background()
	owner := testutil.NewAccount(t, db)
	p := testutil.NewProject(t, db, owner.ID)
	v := testutil.NewVersionWithSnapshot(t, db, p.ID)
	testutil.NewVersionWithSnapshot(t, db, p.ID)
	var code string
	if err := db.QueryRow(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name, sql, want string
		args            []any
	}{
		{"nickname short", `UPDATE project SET nickname = 'AB' WHERE id = $1`, "project_nickname_ck", []any{p.ID}},
		{"blank name", `UPDATE project SET name = '  ' WHERE id = $1`, "project_name_ck", []any{p.ID}},
		{"island other missing text", `UPDATE project SET island_code = 'other' WHERE id = $1`, "project_island_other_ck", []any{p.ID}},
		{"type other text without other", `UPDATE project SET type_other = 'x' WHERE id = $1`, "project_type_other_ck", []any{p.ID}},
		{"end before start", `UPDATE project SET end_date = start_date WHERE id = $1`, "project_dates_ck", []any{p.ID}},
		{"zero value", `UPDATE project SET value_baht = 0 WHERE id = $1`, "project_value_ck", []any{p.ID}},
		{"progress over 100", `UPDATE project SET progress_pct = 101 WHERE id = $1`, "project_progress_ck", []any{p.ID}},
		{"duplicate version_no", `UPDATE assessment_version SET version_no = 1 WHERE project_id = $1 AND version_no = 2`, "assessment_version_no_uq", []any{p.ID}},
		{"draft with submission", `UPDATE assessment_version SET submission_no = 1 WHERE id = $1`, "assessment_version_state_ck", []any{v.ID}},
		{"submitted without time", `UPDATE assessment_version SET status = 'submitted', submission_no = 1 WHERE id = $1`, "assessment_version_state_ck", []any{v.ID}},
		{"snapshot dates", `UPDATE assessment_version SET snap_end_date = snap_start_date WHERE id = $1`, "assessment_version_dates_ck", []any{v.ID}},
		{"decimals", `UPDATE assessment_version SET snap_rm_decimals = 7 WHERE id = $1`, "assessment_version_rm_decimals_ck", []any{v.ID}},
		{"answer negative x", `INSERT INTO answer (version_id, indicator_code, x) VALUES ($1, $2, -1)`, "answer_x_ck", []any{v.ID, code}},
		{"answer y1 without unit", `INSERT INTO answer (version_id, indicator_code, y1_value) VALUES ($1, $2, 1)`, "answer_y1_pair_ck", []any{v.ID, code}},
		{"answer y2 percent over 100", `INSERT INTO answer (version_id, indicator_code, y2_value, y2_unit) VALUES ($1, $2, 101, 'percent')`, "answer_y2_ck", []any{v.ID, code}},
		{"answer y1 percent over 100", `INSERT INTO answer (version_id, indicator_code, y1_value, y1_unit) VALUES ($1, $2, 101, 'percent')`, "answer_y1_ck", []any{v.ID, code}},
		{"impact order", `UPDATE version_impact_threshold SET b = a WHERE version_id = $1 AND impact_code = 'RI_C'`, "version_impact_threshold_order_ck", []any{v.ID}},
	}
	for _, c := range cases {
		_, err := db.Exec(ctx, c.sql, c.args...)
		if got := constraint(err); got != c.want {
			t.Errorf("%s: constraint %q, want %q", c.name, got, c.want)
		}
	}
	// nickname over 4 characters is rejected by the column type itself.
	if _, err := db.Exec(ctx, `UPDATE project SET nickname = 'ABCDE' WHERE id = $1`, p.ID); err == nil {
		t.Error("5-character nickname accepted")
	}

	// Risk result checks.
	testutil.NewAnswer(t, db, v.ID, code)
	const ins = `INSERT INTO risk_result VALUES ($1, $2, 10, 1, 1, 3, 4, 2, 3, $3, $4, $5::risk_level)`
	for _, c := range []struct {
		name, want string
		riMax, rm  any
		level      string
	}{
		{"level mismatch", "risk_result_level_ck", 4, 4, "VL"},
		{"rm out of range", "risk_result_rm_ck", 4, 6, "VH"},
		{"ri_max wrong", "risk_result_ri_max_ck", 5, 4, "H"},
		{"ok", "", 4, 4, "H"},
	} {
		_, err := db.Exec(ctx, ins, v.ID, code, c.riMax, c.rm, c.level)
		if got := constraint(err); got != c.want {
			t.Errorf("%s: constraint %q, want %q", c.name, got, c.want)
		}
		_, _ = db.Exec(ctx, `DELETE FROM risk_result WHERE version_id = $1`, v.ID)
	}
	// Level boundaries.
	for rm, lvl := range map[string]string{"1.49": "VL", "1.5": "L", "2.49": "L", "2.5": "M", "3.5": "H", "4.49": "H", "4.5": "VH"} {
		_, err := db.Exec(ctx, ins, v.ID, code, 4, rm, lvl)
		if err != nil {
			t.Errorf("rm %s level %s rejected: %v", rm, lvl, err)
		}
		_, _ = db.Exec(ctx, `DELETE FROM risk_result WHERE version_id = $1`, v.ID)
	}

	// Lookup seeds.
	var islands, types int
	if err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM island), (SELECT count(*) FROM project_type)`).Scan(&islands, &types); err != nil {
		t.Fatal(err)
	}
	if islands != 8 || types != 6 {
		t.Errorf("lookup rows: %d islands, %d types", islands, types)
	}
}
