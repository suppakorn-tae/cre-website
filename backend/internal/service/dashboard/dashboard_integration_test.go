package dashboard_test

import (
	"context"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/dashboard"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

var rmOf = map[string]string{"VL": "1", "L": "2", "M": "3", "H": "4", "VH": "5"}

func setup(t *testing.T) (*pgxpool.Pool, *dashboard.Service) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	return pool, dashboard.New(pool)
}

// version adds the next version of a project with one stored result per
// entry of levels (indicator code -> level), and submits it when submit is set.
func version(t *testing.T, db testutil.DB, projectID string, submit bool, levels map[string]string) testutil.Version {
	t.Helper()
	v := testutil.NewVersionWithSnapshot(t, db, projectID)
	for code, lvl := range levels {
		testutil.NewAnswer(t, db, v.ID, code)
		testutil.NewResult(t, db, v.ID, code, func(r *testutil.Result) { r.RM, r.Level = rmOf[lvl], lvl })
	}
	if submit {
		testutil.SubmitVersion(t, db, v.ID)
	}
	return v
}

func exec(t *testing.T, db testutil.DB, sql string, args ...any) {
	t.Helper()
	if _, err := db.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}

func TestSummaryUsesLatestSubmittedLiveVersionsOfOwnLiveProjects(t *testing.T) {
	ctx := context.Background()
	db, svc := setup(t)
	me, other := testutil.NewAccount(t, db).ID, testutil.NewAccount(t, db).ID
	owner := uuid.MustParse(me)
	name := func(n, nick, island, value string) func(*testutil.Project) {
		return func(p *testutil.Project) { p.Name, p.Nickname, p.Island, p.ValueBaht = n, nick, island, value }
	}

	// A: v1 submitted (old, ignored), v2 submitted (counted), v3 draft (ignored).
	a := testutil.NewProject(t, db, me, name("Alpha", "ALPH", "koh_tao", "100.50"))
	version(t, db, a.ID, true, map[string]string{"EC-MG-1": "VH", "EC-MG-2": "VH"})
	v2 := version(t, db, a.ID, true, map[string]string{"EC-MG-1": "H", "EC-MG-2": "VH", "EC-HS-1": "VL"})
	version(t, db, a.ID, false, map[string]string{"EC-MG-1": "VH"})

	// B: v1 submitted, v2 submitted but deleted: v1 counts.
	b := testutil.NewProject(t, db, me, name("Beta", "BETA", "koh_samui", "200.25"))
	v1b := version(t, db, b.ID, true, map[string]string{"EC-MG-1": "H", "EC-MG-2": "M"})
	dead := version(t, db, b.ID, true, map[string]string{"EC-MG-1": "VH"})
	exec(t, db, `UPDATE assessment_version SET deleted_at = now() WHERE id = $1`, dead.ID)

	// C: only a draft. Counts as a project and an island but has no figures.
	c := testutil.NewProject(t, db, me, name("Gamma", "GAMM", "koh_tao", "50.00"))
	version(t, db, c.ID, false, map[string]string{"EC-MG-1": "VH"})

	// D: deleted project with a submitted version.
	d := testutil.NewProject(t, db, me, name("Delta", "DELT", "koh_lanta", "999.00"))
	version(t, db, d.ID, true, map[string]string{"EC-MG-1": "VH"})
	exec(t, db, `UPDATE project SET deleted_at = now() WHERE id = $1`, d.ID)

	// E: another account's project.
	e := testutil.NewProject(t, db, other)
	version(t, db, e.ID, true, map[string]string{"EC-MG-1": "VH", "EC-MG-2": "VH"})

	got, err := svc.Summary(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	wantKpis := dashboard.Kpis{ProjectCount: 3, VersionCount: 5, HVhIndicatorCount: 3, IslandCount: 2, TotalValueBaht: "350.75"}
	if got.Kpis != wantKpis {
		t.Fatalf("kpis = %+v, want %+v", got.Kpis, wantKpis)
	}
	if want := (dashboard.LevelCounts{VL: 1, M: 1, H: 2, VH: 1}); got.Levels != want {
		t.Fatalf("levels = %+v, want %+v", got.Levels, want)
	}
	if len(got.ProjectRisks) != 2 {
		t.Fatalf("project risks = %+v, want Alpha and Beta only", got.ProjectRisks)
	}
	first := got.ProjectRisks[0]
	if first.ProjectID.String() != a.ID || first.VersionID.String() != v2.ID || first.HCount != 1 || first.VhCount != 1 {
		t.Fatalf("first risk = %+v, want Alpha v2 with H=1 VH=1", first)
	}
	if second := got.ProjectRisks[1]; second.VersionID.String() != v1b.ID || second.HCount != 1 || second.VhCount != 0 {
		t.Fatalf("second risk = %+v, want Beta v1 with H=1", second)
	}

	empty, err := svc.Summary(ctx, uuid.New())
	if err != nil || empty.Kpis != (dashboard.Kpis{TotalValueBaht: "0"}) || empty.Levels != (dashboard.LevelCounts{}) || len(empty.ProjectRisks) != 0 {
		t.Fatalf("stranger: %+v err=%v, want all zero", empty, err)
	}
}

// TestFixtureVolume is the p95 check: 200 projects x 10 submitted versions of
// 55 scored indicators each. Every endpoint query set must stay under one
// second at the 95th percentile.
func TestFixtureVolume(t *testing.T) {
	ctx := context.Background()
	db, svc := setup(t)
	me := testutil.NewAccount(t, db).ID
	owner := uuid.MustParse(me)
	// Some noise from other accounts, to prove the owner filter prunes it.
	for i := 0; i < 20; i++ {
		testutil.NewProject(t, db, testutil.NewAccount(t, db).ID)
	}
	exec(t, db, `
		INSERT INTO project (id, owner_id, name, nickname, island_code, type_code,
			start_date, end_date, value_baht)
		SELECT gen_random_uuid(), $1, 'Project ' || n, 'P' || lpad(n::text, 3, '0'),
			(ARRAY['koh_tao','koh_samui','koh_phangan','koh_lanta'])[1 + n % 4], 'building',
			'2027-01-01', '2028-01-01', 1000000 + n
		FROM generate_series(1, 200) n`, me)
	exec(t, db, `
		INSERT INTO assessment_version (id, project_id, version_no, status, submission_no,
			snap_value_baht, snap_start_date, snap_end_date, snap_score_decimals,
			snap_rm_decimals, progress_at_submit, submitted_at)
		SELECT gen_random_uuid(), p.id, v, 'submitted', 1, p.value_baht, p.start_date,
			p.end_date, 2, 2, 50, now()
		FROM project p CROSS JOIN generate_series(1, 10) v WHERE p.owner_id = $1`, me)
	exec(t, db, `
		INSERT INTO answer (version_id, indicator_code, x)
		SELECT v.id, i.code, 1
		FROM assessment_version v
		JOIN project p ON p.id = v.project_id AND p.owner_id = $1
		CROSS JOIN indicator i`, me)
	exec(t, db, `
		INSERT INTO risk_result (version_id, indicator_code, x, y1_pct, y2_pct, rl, ri_c, ri_t, ri_e, ri_max, rm, level)
		SELECT a.version_id, a.indicator_code, 1, 1, 1, 3, 3, 3, 3, 3, s.rm,
			CASE WHEN s.rm < 1.5 THEN 'VL'::risk_level WHEN s.rm < 2.5 THEN 'L'::risk_level
			     WHEN s.rm < 3.5 THEN 'M'::risk_level WHEN s.rm < 4.5 THEN 'H'::risk_level
			     ELSE 'VH'::risk_level END
		FROM answer a
		JOIN assessment_version v ON v.id = a.version_id
		JOIN project p ON p.id = v.project_id AND p.owner_id = $1
		CROSS JOIN LATERAL (SELECT 1 + (abs(hashtext(a.version_id::text || a.indicator_code)) % 9) * 0.5 AS rm) s`, me)
	exec(t, db, `ANALYZE`)

	sum, err := svc.Summary(ctx, owner)
	if err != nil || sum.Kpis.ProjectCount != 200 || sum.Kpis.VersionCount != 2000 || len(sum.ProjectRisks) != 200 {
		t.Fatalf("summary = %+v err=%v", sum.Kpis, err)
	}
	if n := sum.Levels.VL + sum.Levels.L + sum.Levels.M + sum.Levels.H + sum.Levels.VH; n != 200*55 {
		t.Fatalf("level distribution counts %d indicators, want %d (latest version only)", n, 200*55)
	}

	calls := map[string]func() error{
		"summary": func() error { _, err := svc.Summary(ctx, owner); return err },
	}
	for name, call := range calls {
		var d []time.Duration
		for i := 0; i < 20; i++ {
			start := time.Now()
			if err := call(); err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			d = append(d, time.Since(start))
		}
		sort.Slice(d, func(i, j int) bool { return d[i] < d[j] })
		p95 := d[18]
		t.Logf("%s: p95 = %v", name, p95)
		if p95 >= time.Second {
			t.Errorf("%s: p95 = %v, want < 1s", name, p95)
		}
	}

	// Plan of the heaviest query, for the record (no assertion: plans vary).
	rows, err := db.Query(ctx, `EXPLAIN (COSTS OFF)
		WITH latest AS (
			SELECT DISTINCT ON (v.project_id) v.id
			FROM assessment_version v JOIN project p ON p.id = v.project_id
			WHERE p.owner_id = $1 AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status = 'submitted'
			ORDER BY v.project_id, v.version_no DESC)
		SELECT r.level, count(*) FROM latest l JOIN risk_result r ON r.version_id = l.id GROUP BY r.level`, owner)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var plan []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatal(err)
		}
		plan = append(plan, line)
	}
	t.Logf("level distribution plan:\n%s", strings.Join(plan, "\n"))
}
