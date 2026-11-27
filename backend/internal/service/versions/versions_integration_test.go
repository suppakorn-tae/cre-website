package versions_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func setup(t *testing.T) (*pgxpool.Pool, *versions.Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	acct := testutil.NewAccount(t, pool)
	proj := testutil.NewProject(t, pool, acct.ID)
	svc := versions.New(pool, pool, versions.Rounding{ScoreDecimals: 2, RMDecimals: 3})
	return pool, svc, uuid.MustParse(proj.ID), uuid.MustParse(acct.ID)
}

func count(t *testing.T, db *pgxpool.Pool, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreateFreezesSnapshot(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)

	v, err := svc.Create(ctx, pid, owner)
	if err != nil {
		t.Fatal(err)
	}
	if v.No != 1 || v.Status != versions.StatusDraft || !v.Editable || v.ValueBaht != 100000000 {
		t.Fatalf("version = %+v", v)
	}
	if n := count(t, db, `SELECT count(*) FROM version_rl_threshold WHERE version_id = $1`, v.ID); n != 55 {
		t.Fatalf("rl rows = %d, want 55", n)
	}
	if n := count(t, db, `SELECT count(*) FROM version_impact_threshold WHERE version_id = $1`, v.ID); n != 2 {
		t.Fatalf("impact rows = %d, want 2", n)
	}
	var score, rm int
	err = db.QueryRow(ctx, `SELECT snap_score_decimals, snap_rm_decimals FROM assessment_version WHERE id = $1`, v.ID).Scan(&score, &rm)
	if err != nil || score != 2 || rm != 3 {
		t.Fatalf("decimals = %d, %d, err %v", score, rm, err)
	}

	// Changing the catalogue and the project afterwards leaves the snapshot alone.
	_, err = db.Exec(ctx, `UPDATE impact_table SET e = e + 1000`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `UPDATE project SET value_baht = 1 WHERE id = $1`, pid)
	if err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `
		SELECT count(*) FROM version_impact_threshold t JOIN impact_table i ON i.code = t.impact_code
		WHERE t.version_id = $1 AND t.e <> i.e`, v.ID); n != 2 {
		t.Fatalf("snapshot rows that differ from the changed catalogue = %d, want 2", n)
	}
	got, err := svc.Get(ctx, pid, v.ID, owner)
	if err != nil || got.ValueBaht != 100000000 {
		t.Fatalf("value = %v, err %v", got.ValueBaht, err)
	}
}

func TestConcurrentCreatesGetDistinctNumbers(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)

	const n = 8
	var wg sync.WaitGroup
	errs := make(chan error, n)
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.Create(ctx, pid, owner)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if got := count(t, db, `SELECT count(DISTINCT version_no) FROM assessment_version WHERE project_id = $1`, pid); got != n {
		t.Fatalf("distinct numbers = %d, want %d", got, n)
	}
}

func TestOnlyHighestNumberEverCreatedIsEditable(t *testing.T) {
	ctx := context.Background()
	_, svc, pid, owner := setup(t)

	v1, _ := svc.Create(ctx, pid, owner)
	v2, err := svc.Create(ctx, pid, owner)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := svc.IsEditable(ctx, pid, v1.ID, owner); ok {
		t.Fatal("v1 editable after v2 was created")
	}
	if err := svc.Delete(ctx, pid, v2.ID, owner); err != nil {
		t.Fatal(err)
	}
	if ok, err := svc.IsEditable(ctx, pid, v1.ID, owner); err != nil || ok {
		t.Fatalf("v1 editable = %v, err %v after v2 was deleted, want false", ok, err)
	}
	v3, err := svc.Create(ctx, pid, owner)
	if err != nil || v3.No != 3 {
		t.Fatalf("number after delete = %d, err %v, want 3 (never reused)", v3.No, err)
	}
	list, err := svc.List(ctx, pid, owner)
	if err != nil || len(list) != 2 || list[0].No != 3 || list[1].No != 1 {
		t.Fatalf("list = %+v, err %v", list, err)
	}
	if _, err := svc.Get(ctx, pid, v2.ID, owner); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("deleted version: err = %v, want ErrNotFound", err)
	}
}

func TestOwnerCheck(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)
	v, _ := svc.Create(ctx, pid, owner)
	other := uuid.MustParse(testutil.NewAccount(t, db).ID)

	if _, err := svc.Create(ctx, pid, other); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("create: err = %v, want ErrNotFound", err)
	}
	if _, err := svc.Get(ctx, pid, v.ID, other); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("get: err = %v, want ErrNotFound", err)
	}
	if err := svc.Delete(ctx, pid, v.ID, other); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("delete: err = %v, want ErrNotFound", err)
	}
	if l, err := svc.List(ctx, pid, other); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("list foreign = %v, err %v, want ErrNotFound", l, err)
	}
	if _, err := svc.List(ctx, uuid.New(), owner); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("list missing: err = %v, want ErrNotFound", err)
	}
}

func TestListOwnProjectWithoutVersionsIsEmpty(t *testing.T) {
	_, svc, pid, owner := setup(t)
	l, err := svc.List(context.Background(), pid, owner)
	if err != nil || len(l) != 0 {
		t.Fatalf("list = %v, err %v, want empty and no error", l, err)
	}
}

func TestSubmittedVersionStats(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)
	v, _ := svc.Create(ctx, pid, owner)
	testutil.SubmitVersion(t, db, v.ID.String())

	got, err := svc.Get(ctx, pid, v.ID, owner)
	if err != nil || got.Status != versions.StatusSubmitted {
		t.Fatalf("version = %+v, err %v", got, err)
	}
	if got.HighCount == nil || got.VeryHighCount == nil || got.AverageRM == nil || got.ProgressAtSubmit == nil {
		t.Fatalf("submitted version lacks stats: %+v", got)
	}
	if got.ScoredCount == nil || got.LevelCounts == nil {
		t.Fatalf("submitted version lacks level counts: %+v", got)
	}
	if got.StrategiesChosen == nil || got.StrategiesNeeded == nil ||
		*got.StrategiesNeeded != *got.HighCount+*got.VeryHighCount {
		t.Fatalf("strategy count = %v of %v, want needed = H + VH", got.StrategiesChosen, got.StrategiesNeeded)
	}
	sum := 0
	for _, n := range got.LevelCounts {
		sum += n
	}
	if sum != *got.ScoredCount || got.LevelCounts["H"] != *got.HighCount || got.LevelCounts["VH"] != *got.VeryHighCount {
		t.Fatalf("level counts %v do not match scored %d", got.LevelCounts, *got.ScoredCount)
	}
}

func TestDeleteKeepsTheLastVersion(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)
	v1, _ := svc.Create(ctx, pid, owner)
	v2, _ := svc.Create(ctx, pid, owner)

	if err := svc.Delete(ctx, pid, v1.ID, owner); err != nil {
		t.Fatalf("delete one of two: %v", err)
	}
	if err := svc.Delete(ctx, pid, v2.ID, owner); !errors.Is(err, versions.ErrLastVersion) {
		t.Fatalf("delete the last: err = %v, want ErrLastVersion", err)
	}
	if n := count(t, db, `SELECT count(*) FROM assessment_version WHERE project_id = $1 AND deleted_at IS NULL`, pid); n != 1 {
		t.Fatalf("live versions = %d, want 1", n)
	}
	// An already deleted or unknown version is still absent, not a conflict.
	if err := svc.Delete(ctx, pid, v1.ID, owner); !errors.Is(err, versions.ErrNotFound) {
		t.Fatalf("delete a deleted version: err = %v, want ErrNotFound", err)
	}
	// After a new version exists the old one can go again.
	v3, _ := svc.Create(ctx, pid, owner)
	if err := svc.Delete(ctx, pid, v2.ID, owner); err != nil {
		t.Fatalf("delete with a newer version present: %v", err)
	}
	if err := svc.Delete(ctx, pid, v3.ID, owner); !errors.Is(err, versions.ErrLastVersion) {
		t.Fatalf("delete the last again: err = %v, want ErrLastVersion", err)
	}
}

// Two deletes racing for the last two versions must leave one behind.
func TestConcurrentDeletesLeaveOneVersion(t *testing.T) {
	ctx := context.Background()
	for round := 0; round < 5; round++ {
		db, svc, pid, owner := setup(t)
		v1, _ := svc.Create(ctx, pid, owner)
		v2, _ := svc.Create(ctx, pid, owner)

		errs := make([]error, 2)
		var wg sync.WaitGroup
		start := make(chan struct{})
		for i, id := range []uuid.UUID{v1.ID, v2.ID} {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				errs[i] = svc.Delete(ctx, pid, id, owner)
			}()
		}
		close(start)
		wg.Wait()

		if n := count(t, db, `SELECT count(*) FROM assessment_version WHERE project_id = $1 AND deleted_at IS NULL`, pid); n != 1 {
			t.Fatalf("round %d: live versions = %d, want 1 (errs %v)", round, n, errs)
		}
		ok, last := 0, 0
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case errors.Is(err, versions.ErrLastVersion):
				last++
			default:
				t.Fatalf("round %d: unexpected error %v", round, err)
			}
		}
		if ok != 1 || last != 1 {
			t.Fatalf("round %d: ok = %d, last = %d, want 1 and 1", round, ok, last)
		}
	}
}

// The barrier test above cannot fail reliably (both deletes usually finish one
// after the other), so this one pins the lock itself: while another
// transaction holds the project row, Delete must wait for it.
func TestDeleteWaitsForTheProjectLock(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)
	v1, _ := svc.Create(ctx, pid, owner)
	_, _ = svc.Create(ctx, pid, owner)

	holder, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = holder.Rollback(ctx) }()
	if _, err := holder.Exec(ctx, `SELECT id FROM project WHERE id = $1 FOR UPDATE`, pid); err != nil {
		t.Fatal(err)
	}

	done := make(chan error, 1)
	go func() { done <- svc.Delete(ctx, pid, v1.ID, owner) }()
	select {
	case err := <-done:
		t.Fatalf("Delete finished (err %v) while the project row was locked", err)
	case <-time.After(500 * time.Millisecond):
	}

	if err := holder.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Delete after the lock was released: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Delete did not finish after the lock was released")
	}
}

// The panel lists projects through their latest live version, so every live
// project must still have one after the guard. This is the read-only check
// to run on dev and prod too (see the PR).
func TestNoLiveProjectEndsWithoutAVersion(t *testing.T) {
	ctx := context.Background()
	db, svc, pid, owner := setup(t)
	v1, _ := svc.Create(ctx, pid, owner)
	v2, _ := svc.Create(ctx, pid, owner)
	_ = svc.Delete(ctx, pid, v1.ID, owner)
	_ = svc.Delete(ctx, pid, v2.ID, owner)
	if n := count(t, db, `
		SELECT count(*) FROM project p
		WHERE p.deleted_at IS NULL AND NOT EXISTS (
		    SELECT 1 FROM assessment_version v WHERE v.project_id = p.id AND v.deleted_at IS NULL)`); n != 0 {
		t.Fatalf("%d live projects have no live version", n)
	}
}
