package assessments_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func setupSubmit(t *testing.T) (*pgxpool.Pool, *svc.SubmitService, testutil.Account, testutil.Project, testutil.Version) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	acct := testutil.NewAccount(t, pool)
	proj := testutil.NewProject(t, pool, acct.ID)
	v := testutil.NewVersionWithSnapshot(t, pool, proj.ID)
	return pool, svc.NewSubmitService(pool), acct, proj, v
}

func count(t *testing.T, db *pgxpool.Pool, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func ids(a testutil.Account, p testutil.Project, v testutil.Version) (uuid.UUID, uuid.UUID, uuid.UUID) {
	return uuid.MustParse(a.ID), uuid.MustParse(p.ID), uuid.MustParse(v.ID)
}

func TestSubmitStoresResults(t *testing.T) {
	ctx := context.Background()
	db, s, acct, proj, v := setupSubmit(t)
	testutil.NewAnswer(t, db, v.ID, "EC-MG-1")
	testutil.NewAnswer(t, db, v.ID, "EC-MG-2", func(a *testutil.Answer) { a.Y3 = []string{"G", "C"} })
	// Incomplete: no y3 and no y2.
	if _, err := db.Exec(ctx, `INSERT INTO answer (version_id, indicator_code, x) VALUES ($1, 'EC-MG-3', 1)`, v.ID); err != nil {
		t.Fatal(err)
	}
	o, p, vid := ids(acct, proj, v)
	res, err := s.Submit(ctx, o, p, vid)
	if err != nil {
		t.Fatal(err)
	}
	if res.Scored != 2 || res.SubmittedAt.IsZero() {
		t.Fatalf("result = %+v", res)
	}
	if n := count(t, db, `SELECT count(*) FROM risk_result WHERE version_id = $1`, v.ID); n != 2 {
		t.Fatalf("results = %d, want 2", n)
	}
	// 1,000,000 baht of 100,000,000 is 1 %; 30 days of 730 is 4.1 %.
	var y1, y2 float64
	if err := db.QueryRow(ctx, `SELECT y1_pct::float8, round(y2_pct, 1)::float8 FROM risk_result
		WHERE version_id = $1 AND indicator_code = 'EC-MG-1'`, v.ID).Scan(&y1, &y2); err != nil || y1 != 1 || y2 != 4.1 {
		t.Fatalf("y1 %v y2 %v err %v", y1, y2, err)
	}
	var status string
	var no int
	if err := db.QueryRow(ctx, `SELECT status::text, submission_no FROM assessment_version WHERE id = $1`, v.ID).Scan(&status, &no); err != nil || status != "submitted" || no != 1 {
		t.Fatalf("status %s no %d err %v", status, no, err)
	}
}

func TestSubmitRollsBackOnAnyFailure(t *testing.T) {
	ctx := context.Background()
	db, s, acct, proj, v := setupSubmit(t)
	testutil.NewAnswer(t, db, v.ID, "EC-MG-1")
	// A with another option is not allowed by the engine.
	testutil.NewAnswer(t, db, v.ID, "EC-MG-2", func(a *testutil.Answer) { a.Y3 = []string{"A", "B"} })
	o, p, vid := ids(acct, proj, v)
	if _, err := s.Submit(ctx, o, p, vid); err == nil {
		t.Fatal("submit must fail")
	}
	if n := count(t, db, `SELECT count(*) FROM risk_result WHERE version_id = $1`, v.ID); n != 0 {
		t.Fatalf("results = %d, want 0 after rollback", n)
	}
	if n := count(t, db, `SELECT count(*) FROM assessment_version WHERE id = $1 AND status = 'draft'`, v.ID); n != 1 {
		t.Fatal("version must stay draft")
	}
}

func TestSubmitGuards(t *testing.T) {
	ctx := context.Background()
	db, s, acct, proj, v := setupSubmit(t)
	o, p, vid := ids(acct, proj, v)
	if _, err := s.Submit(ctx, o, p, vid); !errors.Is(err, svc.ErrNoCompleteIndicator) {
		t.Fatalf("empty version: err = %v, want ErrNoCompleteIndicator", err)
	}
	if _, err := s.Submit(ctx, uuid.New(), p, vid); !errors.Is(err, svc.ErrSubmitNotFound) {
		t.Fatalf("other owner: err = %v, want ErrSubmitNotFound", err)
	}
	testutil.NewVersionWithSnapshot(t, db, proj.ID)
	if _, err := s.Submit(ctx, o, p, vid); !errors.Is(err, svc.ErrSubmitNotLatest) {
		t.Fatalf("old version: err = %v, want ErrSubmitNotLatest", err)
	}
}

func TestResubmitRecalculatesAndDropsIncomplete(t *testing.T) {
	ctx := context.Background()
	db, s, acct, proj, v := setupSubmit(t)
	testutil.NewAnswer(t, db, v.ID, "EC-MG-1")
	testutil.NewAnswer(t, db, v.ID, "EC-MG-2")
	o, p, vid := ids(acct, proj, v)
	if _, err := s.Submit(ctx, o, p, vid); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `DELETE FROM answer_y3 WHERE version_id = $1 AND indicator_code = 'EC-MG-2'`, v.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE answer SET y1_value = 50000000 WHERE version_id = $1 AND indicator_code = 'EC-MG-1'`, v.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Submit(ctx, o, p, vid); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM risk_result WHERE version_id = $1`, v.ID); n != 1 {
		t.Fatalf("results = %d, want 1 (EC-MG-2 no longer complete)", n)
	}
	if n := count(t, db, `SELECT count(*) FROM risk_result WHERE version_id = $1 AND y1_pct = 50`, v.ID); n != 1 {
		t.Fatal("EC-MG-1 not recalculated")
	}
	if n := count(t, db, `SELECT submission_no FROM assessment_version WHERE id = $1`, v.ID); n != 2 {
		t.Fatalf("submission_no = %d, want 2", n)
	}
}
