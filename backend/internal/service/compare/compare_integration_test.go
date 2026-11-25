package compare_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/compare"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type env struct {
	db       *pgxpool.Pool
	svc      *compare.Service
	owner    uuid.UUID
	project  uuid.UUID
	codes    []string
	v1, v2   uuid.UUID
	draftID  uuid.UUID
	otherAcc uuid.UUID
}

// scored adds a version with one result per code, at the given RM and level.
func scored(t *testing.T, db *pgxpool.Pool, project string, submit bool, codes []string, rm, level string) string {
	t.Helper()
	v := testutil.NewVersionWithSnapshot(t, db, project)
	for _, c := range codes {
		testutil.NewAnswer(t, db, v.ID, c)
		testutil.NewResult(t, db, v.ID, c, func(r *testutil.Result) { r.RM, r.Level = rm, level })
	}
	if submit {
		testutil.SubmitVersion(t, db, v.ID)
	}
	return v.ID
}

func setup(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)
	acct := testutil.NewAccount(t, db)
	other := testutil.NewAccount(t, db)
	proj := testutil.NewProject(t, db, acct.ID)
	var codes []string
	rows, err := db.Query(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 3`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			t.Fatal(err)
		}
		codes = append(codes, c)
	}
	rows.Close()
	if len(codes) != 3 {
		t.Fatalf("catalogue has %d indicators, want 3 or more", len(codes))
	}
	e := env{
		db: db, svc: compare.New(db), owner: uuid.MustParse(acct.ID), project: uuid.MustParse(proj.ID),
		codes: codes, otherAcc: uuid.MustParse(other.ID),
	}
	// v1: all three M (RM 3). v2: first indicator H (4), second M, third not scored.
	e.v1 = uuid.MustParse(scored(t, db, proj.ID, true, codes, "3", "M"))
	e.v2 = uuid.MustParse(scored(t, db, proj.ID, true, codes[:1], "4", "H"))
	testutil.NewAnswer(t, db, e.v2.String(), codes[1])
	testutil.NewResult(t, db, e.v2.String(), codes[1], func(r *testutil.Result) { r.RM, r.Level = "3", "M" })
	e.draftID = uuid.MustParse(scored(t, db, proj.ID, false, nil, "", ""))
	return e
}

func TestCompareUsesStoredResults(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	c, err := e.svc.Compare(ctx, e.owner, e.project, e.v2, nil) // base defaults to v1
	if err != nil {
		t.Fatal(err)
	}
	if c.Base.VersionID != e.v1 || c.Target.VersionID != e.v2 {
		t.Fatalf("compared %v with %v", c.Base.VersionID, c.Target.VersionID)
	}
	if c.Base.ScoredCount != 3 || c.Target.ScoredCount != 2 || c.Target.HVhCount != 1 {
		t.Fatalf("base = %+v target = %+v", c.Base, c.Target)
	}
	if c.Target.AvgRM == nil || *c.Target.AvgRM != 3.5 {
		t.Fatalf("target avg = %v, want 3.5", c.Target.AvgRM)
	}
	if len(c.Changes) != 1 || c.Changes[0].IndicatorCode != e.codes[0] || !c.Changes[0].Up || c.LevelUp != 1 || c.LevelDown != 0 {
		t.Fatalf("changes = %+v up = %d down = %d", c.Changes, c.LevelUp, c.LevelDown)
	}
	// Swapped, the same change reads as a fall.
	d, err := e.svc.Compare(ctx, e.owner, e.project, e.v1, &e.v2)
	if err != nil || d.LevelDown != 1 || d.Changes[0].Up {
		t.Fatalf("swapped = %+v, err %v", d, err)
	}
}

func TestCompareRefusals(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	other := testutil.NewProject(t, e.db, e.owner.String())
	foreign := uuid.MustParse(scored(t, e.db, other.ID, true, e.codes[:1], "3", "M"))
	cases := []struct {
		name    string
		owner   uuid.UUID
		project uuid.UUID
		target  uuid.UUID
		base    *uuid.UUID
		want    error
	}{
		{"other user", e.otherAcc, e.project, e.v2, nil, compare.ErrNotFound},
		{"version of another project", e.owner, e.project, foreign, nil, compare.ErrNotFound},
		{"base of another project", e.owner, e.project, e.v2, &foreign, compare.ErrNotFound},
		{"draft target", e.owner, e.project, e.draftID, nil, compare.ErrNotSubmitted},
		{"draft base", e.owner, e.project, e.v2, &e.draftID, compare.ErrNotSubmitted},
		{"no earlier version", e.owner, e.project, e.v1, nil, compare.ErrNoBase},
		{"same version", e.owner, e.project, e.v2, &e.v2, compare.ErrSameVersion},
	}
	for _, c := range cases {
		if _, err := e.svc.Compare(ctx, c.owner, c.project, c.target, c.base); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
	// A deleted version looks absent.
	if _, err := e.db.Exec(ctx, `UPDATE assessment_version SET deleted_at = now() WHERE id = $1`, e.v1); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Compare(ctx, e.owner, e.project, e.v2, &e.v1); !errors.Is(err, compare.ErrNotFound) {
		t.Fatalf("deleted base: err = %v, want not found", err)
	}
}

func TestTrendAndIndicatorRM(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	pts, err := e.svc.Trend(ctx, e.owner, e.project)
	if err != nil || len(pts) != 3 {
		t.Fatalf("trend = %+v, err %v", pts, err)
	}
	if pts[1].Levels == nil || pts[1].Levels.H != 1 || pts[1].Levels.M != 1 || *pts[1].HVhCount != 1 {
		t.Fatalf("v2 point = %+v", pts[1])
	}
	if d := pts[2]; d.Submitted || d.AvgRM != nil || d.Levels != nil || d.SubmittedAt != nil {
		t.Fatalf("draft point = %+v, want an empty slot", d)
	}
	if _, err := e.svc.Trend(ctx, e.otherAcc, e.project); !errors.Is(err, compare.ErrNotFound) {
		t.Fatalf("other user: err = %v, want not found", err)
	}

	m, err := e.svc.IndicatorRM(ctx, e.owner, e.project, nil, nil)
	if err != nil || len(m.Versions) != 3 || len(m.Indicators) != 3 {
		t.Fatalf("matrix = %+v, err %v", m, err)
	}
	third := m.Indicators[2].Points // scored in v1 only
	if third[0].RM == nil || third[1].RM != nil || third[2].RM != nil {
		t.Fatalf("third indicator points = %+v", third)
	}
	f, err := e.svc.IndicatorRM(ctx, e.owner, e.project, nil, []string{e.codes[0]})
	if err != nil || len(f.Indicators) != 1 || f.Indicators[0].IndicatorCode != e.codes[0] {
		t.Fatalf("indicator filter = %+v, err %v", f, err)
	}
	none, err := e.svc.IndicatorRM(ctx, e.owner, e.project, []string{"no-such-factor"}, nil)
	if err != nil || len(none.Indicators) != 0 || len(none.Versions) != 3 {
		t.Fatalf("factor filter = %+v, err %v", none, err)
	}
}
