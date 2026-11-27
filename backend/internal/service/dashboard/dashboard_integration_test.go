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

func TestPanels(t *testing.T) {
	ctx := context.Background()
	db, svc := setup(t)
	me := testutil.NewAccount(t, db).ID
	owner := uuid.MustParse(me)
	mk := func(n, nick, island string) testutil.Project {
		return testutil.NewProject(t, db, me, func(p *testutil.Project) { p.Name, p.Nickname, p.Island = n, nick, island })
	}
	a := mk("Alpha pier", "ALPH", "koh_samui")
	va := version(t, db, a.ID, true, map[string]string{"EC-MG-1": "VH", "EC-MG-2": "H", "EC-HS-1": "L"})
	va2 := version(t, db, a.ID, false, nil)
	b := mk("Beta", "BETA", "koh_tao")
	vb := version(t, db, b.ID, true, map[string]string{"EC-MG-1": "H", "EC-MG-2": "H", "EC-HS-1": "VH"})
	c := mk("Gamma", "GAMM", "koh_tao")
	vc := version(t, db, c.ID, false, nil)
	mk("No versions", "NONE", "koh_tao")

	page, err := svc.Projects(ctx, owner, dashboard.ProjectsParams{Page: 1, PageSize: 10})
	if err != nil || page.Total != 3 || len(page.Items) != 3 {
		t.Fatalf("projects = %+v err=%v, want 3 projects with a live version", page, err)
	}
	byName := map[string]dashboard.ProjectItem{}
	for _, it := range page.Items {
		byName[it.Name] = it
	}
	al := byName["Alpha pier"]
	if al.LatestVersionID.String() != va2.ID || al.LatestVersionNo != 2 || al.LatestVersionStatus != "draft" ||
		al.LatestSubmittedVersionID == nil || al.LatestSubmittedVersionID.String() != va.ID ||
		al.HVhCount == nil || *al.HVhCount != 2 || al.AvgRM == nil || *al.AvgRM != "3.67" || al.VersionCount != 2 {
		t.Fatalf("alpha = %+v", al)
	}
	// Counts are stored rows of the latest version: Alpha's draft v2 has no
	// results yet, Beta's submitted v1 has three; the snapshot covers every indicator.
	if al.LatestVersionScored != 0 || al.LatestVersionTotal != 55 {
		t.Fatalf("alpha scored/total = %d/%d, want 0/55", al.LatestVersionScored, al.LatestVersionTotal)
	}
	if be := byName["Beta"]; be.LatestVersionScored != 3 || be.LatestVersionTotal != 55 {
		t.Fatalf("beta scored/total = %d/%d, want 3/55", be.LatestVersionScored, be.LatestVersionTotal)
	}
	if g := byName["Gamma"]; g.LatestVersionID.String() != vc.ID || g.LatestSubmittedVersionID != nil || g.HVhCount != nil || g.AvgRM != nil {
		t.Fatalf("gamma = %+v, want no submitted figures", g)
	}
	if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: "pier", Page: 1, PageSize: 10}); len(s.Items) != 1 || s.Total != 1 {
		t.Fatalf("search = %+v", s)
	}
	if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: "%", Page: 1, PageSize: 10}); len(s.Items) != 0 {
		t.Fatalf("a literal %% must not match everything: %+v", s)
	}
	for _, q := range []string{"_", `\`, "Al_ha"} {
		if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: q, Page: 1, PageSize: 10}); len(s.Items) != 0 {
			t.Fatalf("%q must match literally, got %+v", q, s)
		}
	}
	if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: "  beta  ", Page: 1, PageSize: 10}); len(s.Items) != 1 {
		t.Fatalf("search is case-insensitive and trimmed: %+v", s)
	}
	// The search also matches the island, by code or by Thai name.
	for q, want := range map[string]int{"samui": 1, "koh samui": 1, "สมุย": 1, "เกาะสมุย": 1, "เกาะเต่า": 2, "koh": 3, "เกาะ": 3, "ภูเก็ต": 0} {
		if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: q, Page: 1, PageSize: 10}); len(s.Items) != want || s.Total != want {
			t.Fatalf("island search %q = %d items (total %d), want %d", q, len(s.Items), s.Total, want)
		}
	}
	// Newest project first.
	if len(page.Items) != 3 || page.Items[0].Name != "Gamma" || page.Items[1].Name != "Beta" || page.Items[2].Name != "Alpha pier" {
		t.Fatalf("order = %+v, want newest first", page.Items)
	}
	if s, _ := svc.Projects(ctx, owner, dashboard.ProjectsParams{Page: 3, PageSize: 2}); len(s.Items) != 0 || s.Total != 3 {
		t.Fatalf("page past the end = %+v, want no items and total 3", s)
	}
	if s, _ := svc.Projects(ctx, uuid.New(), dashboard.ProjectsParams{Page: 1, PageSize: 10}); len(s.Items) != 0 {
		t.Fatalf("stranger sees %+v", s)
	}

	top, err := svc.TopIndicators(ctx, owner)
	if err != nil || len(top) != 3 {
		t.Fatalf("top = %+v err=%v", top, err)
	}
	// EC-MG-1: VH+H, EC-MG-2: H+H (same total, fewer VH), EC-HS-1: VH only (total 1).
	if top[0].IndicatorCode != "EC-MG-1" || top[0].Rank != 1 || top[0].HCount != 1 || top[0].VhCount != 1 ||
		top[1].IndicatorCode != "EC-MG-2" || top[1].HCount != 2 ||
		top[2].IndicatorCode != "EC-HS-1" || top[2].Rank != 3 || top[2].FactorCode != "EC-HS" {
		t.Fatalf("top = %+v", top)
	}
	// Alpha and Beta share EC-MG-1 and EC-MG-2; EC-HS-1 is Beta's alone. The
	// projects come ordered by nickname; a stranger's projects never appear.
	if len(top[0].Projects) != 2 || top[0].FoundIn != 2 ||
		top[0].Projects[0].Nickname != "ALPH" || top[0].Projects[0].ID.String() != a.ID ||
		top[0].Projects[1].Nickname != "BETA" || top[0].Projects[1].ID.String() != b.ID {
		t.Fatalf("EC-MG-1 projects = %+v", top[0])
	}
	if top[2].FoundIn != 1 || len(top[2].Projects) != 1 || top[2].Projects[0].Nickname != "BETA" {
		t.Fatalf("EC-HS-1 projects = %+v", top[2])
	}

	groups, err := svc.Islands(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	// island order: koh_tao (1) before koh_samui (2); the project without a version is absent.
	if len(groups) != 2 || groups[0].IslandCode != "koh_tao" || groups[1].IslandCode != "koh_samui" ||
		len(groups[0].Projects) != 2 || groups[0].Projects[0].Name != "Beta" || groups[0].Projects[1].Name != "Gamma" {
		t.Fatalf("islands = %+v", groups)
	}
	if h := groups[0].Projects[0].HVhCount; h == nil || *h != 3 || groups[0].Projects[0].LatestVersionID.String() != vb.ID {
		t.Fatalf("beta = %+v", groups[0].Projects[0])
	}
	if g := groups[0].Projects[1]; g.HVhCount != nil || g.LatestVersionID.String() != vc.ID {
		t.Fatalf("gamma = %+v, want no figure until submitted", g)
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
		"projects": func() error {
			_, err := svc.Projects(ctx, owner, dashboard.ProjectsParams{Page: 1, PageSize: 20})
			return err
		},
		"projects-q": func() error {
			_, err := svc.Projects(ctx, owner, dashboard.ProjectsParams{Q: "project 1", Page: 2, PageSize: 20})
			return err
		},
		"top-indicators": func() error { _, err := svc.TopIndicators(ctx, owner); return err },
		"islands":        func() error { _, err := svc.Islands(ctx, owner); return err },
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
