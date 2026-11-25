package projects_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/projects"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type env struct {
	db   *pgxpool.Pool
	svc  *projects.Service
	a, b uuid.UUID // two owners
}

func newEnv(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	db := testutil.NewDB(t)
	now := func() time.Time { return time.Date(2027, 7, 1, 12, 0, 0, 0, time.UTC) }
	return env{
		db: db, svc: projects.New(db, now),
		a: uuid.MustParse(testutil.NewAccount(t, db).ID),
		b: uuid.MustParse(testutil.NewAccount(t, db).ID),
	}
}

func fields(name string) projects.Fields {
	return projects.Fields{
		Name: name, Nickname: "TST1", IslandCode: "koh_tao", TypeCode: "building",
		StartDate: "2027-01-01", EndDate: "2027-12-31", ValueBaht: "100000000", ProgressPct: 5,
	}
}

func ptr[T any](v T) *T { return &v }

func TestCreateAndGet(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	p, err := e.svc.Create(ctx, e.a, fields("Hotel"))
	if err != nil {
		t.Fatal(err)
	}
	if p.ValueBaht != "100000000.00" || p.ProgressPct != 5 || p.VersionCount != 0 || p.LatestVersionNo != nil {
		t.Fatalf("created: %+v", p)
	}
	// 1 Jul is day 181 of 364: 49.7 -> 50 (BR-24).
	if p.ExpectedProgressPct != 50 {
		t.Fatalf("expected progress %d", p.ExpectedProgressPct)
	}
	got, err := e.svc.Get(ctx, e.a, p.ID)
	if err != nil || got.Name != "Hotel" || got.StartDate != "2027-01-01" {
		t.Fatalf("get: %+v %v", got, err)
	}
	// Create with invalid data stores nothing.
	bad := fields("x")
	bad.EndDate = bad.StartDate
	var ve *projects.ValidationError
	if _, err := e.svc.Create(ctx, e.a, bad); !errors.As(err, &ve) {
		t.Fatalf("want validation error, got %v", err)
	}
	if pg, _ := e.svc.List(ctx, e.a, projects.ListParams{Page: 1, PageSize: 20}); pg.Total != 1 {
		t.Fatalf("total %d", pg.Total)
	}
}

func TestOtherUserAndDeletedAreNotFound(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	p := testutil.NewProject(t, e.db, e.a.String())
	id := uuid.MustParse(p.ID)

	if _, err := e.svc.Get(ctx, e.b, id); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("get other: %v", err)
	}
	if _, err := e.svc.Update(ctx, e.b, id, projects.Patch{Name: ptr("hijack")}); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("update other: %v", err)
	}
	if err := e.svc.Delete(ctx, e.b, id); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("delete other: %v", err)
	}
	if pg, _ := e.svc.List(ctx, e.b, projects.ListParams{Page: 1, PageSize: 20}); pg.Total != 0 || len(pg.Items) != 0 {
		t.Fatalf("list other: %+v", pg)
	}
	// Still intact for the owner.
	if got, err := e.svc.Get(ctx, e.a, id); err != nil || got.Name != "Test project" {
		t.Fatalf("owner after attacks: %+v %v", got, err)
	}

	if err := e.svc.Delete(ctx, e.a, id); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Get(ctx, e.a, id); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("get deleted: %v", err)
	}
	if _, err := e.svc.Update(ctx, e.a, id, projects.Patch{Name: ptr("x")}); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("update deleted: %v", err)
	}
	if err := e.svc.Delete(ctx, e.a, id); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("delete twice: %v", err)
	}
	if pg, _ := e.svc.List(ctx, e.a, projects.ListParams{Page: 1, PageSize: 20}); pg.Total != 0 {
		t.Fatalf("list deleted: %+v", pg)
	}
}

func TestDeleteHidesVersions(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	p := testutil.NewProject(t, e.db, e.a.String())
	other := testutil.NewProject(t, e.db, e.a.String())
	v1 := testutil.NewVersionWithSnapshot(t, e.db, p.ID)
	testutil.NewVersionWithSnapshot(t, e.db, p.ID)
	ov := testutil.NewVersionWithSnapshot(t, e.db, other.ID)

	got, err := e.svc.Get(ctx, e.a, uuid.MustParse(p.ID))
	if err != nil || got.VersionCount != 2 || got.LatestVersionNo == nil || *got.LatestVersionNo != 2 {
		t.Fatalf("before: %+v %v", got, err)
	}
	if err := e.svc.Delete(ctx, e.a, uuid.MustParse(p.ID)); err != nil {
		t.Fatal(err)
	}
	var live int
	if err := e.db.QueryRow(ctx,
		`SELECT count(*) FROM assessment_version WHERE project_id = $1 AND deleted_at IS NULL`, p.ID).Scan(&live); err != nil || live != 0 {
		t.Fatalf("live versions of deleted project: %d %v", live, err)
	}
	var otherLive int
	if err := e.db.QueryRow(ctx, `SELECT count(*) FROM assessment_version WHERE id = $1 AND deleted_at IS NULL`, ov.ID).Scan(&otherLive); err != nil || otherLive != 1 {
		t.Fatalf("other project's version must stay: %d %v", otherLive, err)
	}
	// The rows are kept (soft delete), only hidden.
	var total int
	if err := e.db.QueryRow(ctx, `SELECT count(*) FROM assessment_version WHERE id = $1`, v1.ID).Scan(&total); err != nil || total != 1 {
		t.Fatalf("version row kept: %d %v", total, err)
	}
}

func TestVersionCountIgnoresDeletedVersions(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	p := testutil.NewProject(t, e.db, e.a.String())
	testutil.NewVersionWithSnapshot(t, e.db, p.ID)
	v2 := testutil.NewVersionWithSnapshot(t, e.db, p.ID)
	if _, err := e.db.Exec(ctx, `UPDATE assessment_version SET deleted_at = now() WHERE id = $1`, v2.ID); err != nil {
		t.Fatal(err)
	}
	got, err := e.svc.Get(ctx, e.a, uuid.MustParse(p.ID))
	if err != nil || got.VersionCount != 1 || *got.LatestVersionNo != 1 {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestListSearchAndPaging(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	mk := func(name, nick, island string, other *string) {
		t.Helper()
		f := fields(name)
		f.Nickname, f.IslandCode, f.IslandOther = nick, island, other
		if _, err := e.svc.Create(ctx, e.a, f); err != nil {
			t.Fatal(err)
		}
		time.Sleep(2 * time.Millisecond) // distinct created_at for ordering
	}
	mk("Alpha Hotel", "ALPH", "koh_tao", nil)
	mk("Beta Pier", "BETA", "koh_phi_phi", nil)
	mk("Gamma 100% Villa", "GAMA", "other", ptr("Koh Mak"))
	mk("Delta Road", "DELT", "koh_samui", nil)
	if _, err := e.svc.Create(ctx, e.b, fields("Alpha of someone else")); err != nil {
		t.Fatal(err)
	}

	names := func(q string, page, size int) ([]string, int) {
		t.Helper()
		pg, err := e.svc.List(ctx, e.a, projects.ListParams{Q: q, Page: page, PageSize: size})
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, p := range pg.Items {
			out = append(out, p.Name)
		}
		return out, pg.Total
	}
	eq := func(got []string, want ...string) {
		t.Helper()
		if len(got) != len(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
		for i := range got {
			if got[i] != want[i] {
				t.Fatalf("got %v, want %v", got, want)
			}
		}
	}

	got, total := names("", 1, 20)
	eq(got, "Delta Road", "Gamma 100% Villa", "Beta Pier", "Alpha Hotel") // newest first
	if total != 4 {
		t.Fatalf("total %d", total)
	}
	got, _ = names("alpha", 1, 20) // name, case-insensitive, own projects only
	eq(got, "Alpha Hotel")
	got, _ = names("beta", 1, 20) // nickname too
	eq(got, "Beta Pier")
	got, _ = names("DELT", 1, 20)
	eq(got, "Delta Road")
	got, _ = names("phi", 1, 20) // island code
	eq(got, "Beta Pier")
	got, _ = names("koh phi", 1, 20) // island code read as words
	eq(got, "Beta Pier")
	got, _ = names("mak", 1, 20) // free-text island
	eq(got, "Gamma 100% Villa")
	got, _ = names("100%", 1, 20) // wildcards are literal
	eq(got, "Gamma 100% Villa")
	got, _ = names("%", 1, 20)
	eq(got, "Gamma 100% Villa")
	got, total = names("zzz", 1, 20)
	eq(got)
	if total != 0 {
		t.Fatalf("total %d", total)
	}

	got, total = names("", 1, 3)
	eq(got, "Delta Road", "Gamma 100% Villa", "Beta Pier")
	if total != 4 {
		t.Fatalf("total %d", total)
	}
	got, total = names("", 2, 3)
	eq(got, "Alpha Hotel")
	if total != 4 {
		t.Fatalf("total %d", total)
	}
	got, total = names("", 9, 3) // past the end keeps the total
	eq(got)
	if total != 4 {
		t.Fatalf("past end total %d", total)
	}
}

func TestUpdate(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	f := fields("Old")
	f.Description = ptr("note")
	p, err := e.svc.Create(ctx, e.a, f)
	if err != nil {
		t.Fatal(err)
	}

	got, err := e.svc.Update(ctx, e.a, p.ID, projects.Patch{Name: ptr("New"), ProgressPct: ptr(40), ValueBaht: ptr("250.5")})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "New" || got.ProgressPct != 40 || got.ValueBaht != "250.50" || got.Nickname != "TST1" ||
		got.Description == nil || *got.Description != "note" || !got.UpdatedAt.After(p.UpdatedAt) {
		t.Fatalf("patched: %+v", got)
	}

	// null clears description; island other sets then clears with the code.
	got, err = e.svc.Update(ctx, e.a, p.ID, projects.Patch{Description: projects.Nullable{Set: true}})
	if err != nil || got.Description != nil {
		t.Fatalf("clear description: %+v %v", got, err)
	}
	got, err = e.svc.Update(ctx, e.a, p.ID, projects.Patch{IslandCode: ptr("other"), IslandOther: projects.Nullable{Set: true, Value: ptr(" Koh Mak ")}})
	if err != nil || got.IslandOther == nil || *got.IslandOther != "Koh Mak" {
		t.Fatalf("island other: %+v %v", got, err)
	}
	got, err = e.svc.Update(ctx, e.a, p.ID, projects.Patch{IslandCode: ptr("koh_tao")})
	if err != nil || got.IslandOther != nil {
		t.Fatalf("island other cleared: %+v %v", got, err)
	}

	// Validation applies to the stored result: moving the end before the
	// start is rejected and nothing changes.
	var ve *projects.ValidationError
	if _, err := e.svc.Update(ctx, e.a, p.ID, projects.Patch{EndDate: ptr("2026-12-31")}); !errors.As(err, &ve) ||
		ve.Fields[0].Field != "/end_date" {
		t.Fatalf("want end_date error, got %v", err)
	}
	again, _ := e.svc.Get(ctx, e.a, p.ID)
	if again.EndDate != "2027-12-31" {
		t.Fatalf("unchanged: %+v", again)
	}
}
