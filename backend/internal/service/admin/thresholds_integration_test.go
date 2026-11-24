package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type cacheSpy struct{ calls int }

func (c *cacheSpy) Invalidate(context.Context) error { c.calls++; return nil }

func setup(t *testing.T) (*pgxpool.Pool, *admin.Thresholds, *cacheSpy, context.Context, uuid.UUID) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test")
	}
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
	adminID := uuid.MustParse(acc.ID)
	spy := &cacheSpy{}
	s := admin.NewThresholds(db, audit.New(audit.NewRepository()), spy, nil)
	ctx := log.WithRequestID(context.Background(), "req-1")
	ctx = audit.WithAdmin(ctx, adminID)
	ctx = audit.WithClientIP(ctx, "203.0.113.7")
	return db, s, spy, ctx, adminID
}

func count(t *testing.T, db *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// fiveThresholdIndicator returns a normal indicator with a to e all set.
func fiveThresholdIndicator(t *testing.T, db *pgxpool.Pool) string {
	t.Helper()
	var code string
	err := db.QueryRow(context.Background(), `SELECT code FROM indicator
		WHERE direction = 'normal' AND a IS NOT NULL AND e IS NOT NULL ORDER BY code LIMIT 1`).Scan(&code)
	if err != nil {
		t.Fatal(err)
	}
	return code
}

// An edit changes the catalogue and leaves the snapshot of an existing
// version alone, writes one audit entry and invalidates the cache once.
func TestUpdateRLKeepsVersionSnapshot(t *testing.T) {
	db, s, spy, ctx, adminID := setup(t)
	owner := testutil.NewAccount(t, db)
	version := testutil.NewVersionWithSnapshot(t, db, testutil.NewProject(t, db, owner.ID).ID)

	code := fiveThresholdIndicator(t, db)
	before, err := s.GetRL(ctx, code)
	if err != nil {
		t.Fatal(err)
	}
	snap := `SELECT count(*) FROM version_rl_threshold
		WHERE version_id = $1 AND indicator_code = $2 AND a = $3 AND e = $4`
	if count(t, db, snap, version.ID, code, *before.Values.A, *before.Values.E) != 1 {
		t.Fatal("fixture snapshot does not match the catalogue")
	}

	nv := admin.Values{A: engine.F(100), B: engine.F(200), C: engine.F(300), D: engine.F(400), E: engine.F(500)}
	got, err := s.UpdateRL(ctx, adminID, code, nv)
	if err != nil {
		t.Fatal(err)
	}
	if *got.Values.A != 100 || *got.Values.E != 500 {
		t.Fatalf("stored values = %+v", got.Values)
	}
	if count(t, db, snap, version.ID, code, *before.Values.A, *before.Values.E) != 1 {
		t.Fatal("version_rl_threshold changed by a catalogue edit")
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log WHERE action = 'rl_threshold_edit' AND target_id = $1`, code); n != 1 {
		t.Fatalf("audit rows = %d, want 1", n)
	}
	if spy.calls != 1 {
		t.Fatalf("invalidations = %d, want 1", spy.calls)
	}

	// Saving the same values again writes nothing.
	if _, err := s.UpdateRL(ctx, adminID, code, nv); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log WHERE action = 'rl_threshold_edit'`); n != 1 || spy.calls != 1 {
		t.Fatalf("no-op save wrote audit=%d invalidations=%d", n, spy.calls)
	}
}

func TestUpdateRLInvalidWritesNothing(t *testing.T) {
	db, s, spy, ctx, adminID := setup(t)
	_, err := s.UpdateRL(ctx, adminID, fiveThresholdIndicator(t, db), admin.Values{A: engine.F(1), B: engine.F(2)})
	var ve admin.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
	if _, err := s.UpdateRL(ctx, adminID, "NOPE", admin.Values{}); !errors.Is(err, admin.ErrIndicatorNotFound) {
		t.Fatalf("want ErrIndicatorNotFound, got %v", err)
	}
	if n := count(t, db, `SELECT count(*) FROM audit_log`); n != 0 || spy.calls != 0 {
		t.Fatalf("audit=%d invalidations=%d, want 0", n, spy.calls)
	}
}
