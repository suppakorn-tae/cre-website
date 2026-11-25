package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func setupImpact(t *testing.T) (*pgxpool.Pool, *admin.Impacts, *cacheSpy, context.Context, uuid.UUID) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test")
	}
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
	adminID := uuid.MustParse(acc.ID)
	spy := &cacheSpy{}
	s := admin.NewImpacts(db, audit.New(audit.NewRepository()), spy, nil)
	ctx := log.WithRequestID(context.Background(), "req-1")
	ctx = audit.WithAdmin(ctx, adminID)
	ctx = audit.WithClientIP(ctx, "203.0.113.7")
	return db, s, spy, ctx, adminID
}

// One audit entry per changed table; an unchanged table gets none; the
// version snapshot stays.
func TestUpdateImpactAuditsChangedTablesOnly(t *testing.T) {
	db, s, spy, ctx, adminID := setupImpact(t)
	owner := testutil.NewAccount(t, db)
	version := testutil.NewVersionWithSnapshot(t, db, testutil.NewProject(t, db, owner.ID).ID)

	cur, err := s.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	changed := [5]float64{1, 2, 3, 4, 5}
	if changed == cur.RIC.Values {
		changed = [5]float64{2, 3, 4, 5, 6}
	}
	got, err := s.Update(ctx, adminID, admin.ImpactEdit{RIC: &changed, RIT: &cur.RIT.Values})
	if err != nil {
		t.Fatal(err)
	}
	if got.RIC.Values != changed || got.RIT.Values != cur.RIT.Values {
		t.Fatalf("tables after update: %+v", got)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log WHERE action = 'impact_table_edit' AND target_id = 'RI_C'`); n != 1 {
		t.Fatalf("RI_C audit rows = %d, want 1", n)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log WHERE target_id = 'RI_T'`); n != 0 {
		t.Fatalf("RI_T audit rows = %d, want 0", n)
	}
	if n := count(t, db, `SELECT count(*) FROM version_impact_threshold
		WHERE version_id = $1 AND impact_code = 'RI_C' AND a = $2 AND e = $3`,
		version.ID, cur.RIC.Values[0], cur.RIC.Values[4]); n != 1 {
		t.Fatal("version_impact_threshold changed by a catalogue edit")
	}
	if spy.calls != 1 {
		t.Fatalf("invalidations = %d, want 1", spy.calls)
	}

	// Both tables changed: two entries in one save.
	both := [5]float64{10, 20, 30, 40, 50}
	if _, err := s.Update(ctx, adminID, admin.ImpactEdit{RIC: &both, RIT: &both}); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log WHERE action = 'impact_table_edit'`); n != 3 {
		t.Fatalf("audit rows = %d, want 3", n)
	}
}

func TestUpdateImpactNoOpWritesNothing(t *testing.T) {
	db, s, spy, ctx, adminID := setupImpact(t)
	cur, err := s.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Update(ctx, adminID, admin.ImpactEdit{RIC: &cur.RIC.Values, RIT: &cur.RIT.Values}); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log`); n != 0 || spy.calls != 0 {
		t.Fatalf("audit=%d invalidations=%d, want 0", n, spy.calls)
	}
}

func TestUpdateImpactInvalidWritesNothing(t *testing.T) {
	db, s, spy, ctx, adminID := setupImpact(t)
	good, bad := [5]float64{1, 2, 3, 4, 5}, [5]float64{5, 4, 3, 2, 1}
	_, err := s.Update(ctx, adminID, admin.ImpactEdit{RIC: &good, RIT: &bad})
	var ve admin.ValidationError
	if !errors.As(err, &ve) || ve[0].Field != "/ri_t" {
		t.Fatalf("got %v, want a /ri_t validation error", err)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log`); n != 0 || spy.calls != 0 {
		t.Fatalf("audit=%d invalidations=%d, want 0", n, spy.calls)
	}
}
