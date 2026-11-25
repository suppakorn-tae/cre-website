package sweep_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/sweep"
)

// fakeStore is an in-memory S3. Delete of a missing key succeeds.
type fakeStore struct {
	mu      sync.Mutex
	objects map[string]bool
	deletes int
	failOn  string
}

func newFakeStore(keys ...string) *fakeStore {
	f := &fakeStore{objects: map[string]bool{}}
	for _, k := range keys {
		f.objects[k] = true
	}
	return f
}

func (f *fakeStore) Delete(_ context.Context, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if key == f.failOn {
		return errors.New("s3 down")
	}
	f.deletes++
	delete(f.objects, key)
	return nil
}

// fakeClock is a settable clock.
type fakeClock struct{ t time.Time }

func (c *fakeClock) Now() time.Time { return c.t }

var epoch = time.Date(2026, 11, 20, 3, 0, 0, 0, time.UTC)

// insertExport adds a done export that expires at exp and returns its id and key.
func insertExport(t *testing.T, db testutil.DB, requester string, exp time.Time) (uuid.UUID, string) {
	t.Helper()
	id := uuid.New()
	key := jobs.ObjectKey(jobs.KindExport, id)
	_, err := db.Exec(context.Background(), `
		INSERT INTO job (id, kind, requested_by, status, object_key, finished_at, expires_at)
		VALUES ($1, 'export', $2, 'done', $3, $4, $5)`, id, requester, key, exp.Add(-jobs.ExportTTL), exp)
	if err != nil {
		t.Fatal(err)
	}
	return id, key
}

func status(t *testing.T, db testutil.DB, id uuid.UUID) string {
	t.Helper()
	var s string
	if err := db.QueryRow(context.Background(), `SELECT status::text FROM job WHERE id = $1`, id).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSweepRemovesExpiredKeepsFresh(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db)
	clock := &fakeClock{t: epoch}

	oldID, oldKey := insertExport(t, db, acc.ID, epoch.Add(-time.Hour))
	freshID, freshKey := insertExport(t, db, acc.ID, epoch.Add(time.Hour))
	// An already expired job whose file is gone must not be touched.
	goneID, _ := insertExport(t, db, acc.ID, epoch.Add(-48*time.Hour))
	store := newFakeStore(oldKey, freshKey) // goneKey is missing from S3

	sw := sweep.New(db, store, nil, clock.Now)
	n, err := sw.Run(ctx)
	if err != nil || n != 2 {
		t.Fatalf("first run: n=%d err=%v, want 2, nil", n, err)
	}
	if store.objects[oldKey] || !store.objects[freshKey] {
		t.Fatalf("objects after sweep: %v", store.objects)
	}
	for id, want := range map[uuid.UUID]string{oldID: "expired", goneID: "expired", freshID: "done"} {
		if got := status(t, db, id); got != want {
			t.Errorf("job %s status = %s, want %s", id, got, want)
		}
	}

	// The second run changes nothing.
	deletes := store.deletes
	n, err = sw.Run(ctx)
	if err != nil || n != 0 || store.deletes != deletes {
		t.Fatalf("second run: n=%d err=%v deletes %d->%d", n, err, deletes, store.deletes)
	}

	// A day later the fresh one is past expiry and goes too.
	clock.t = epoch.Add(2 * time.Hour)
	n, err = sw.Run(ctx)
	if err != nil || n != 1 || store.objects[freshKey] || status(t, db, freshID) != "expired" {
		t.Fatalf("third run: n=%d err=%v objects=%v", n, err, store.objects)
	}
}

func TestSweepRetriesAfterStoreFailure(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db)
	badID, badKey := insertExport(t, db, acc.ID, epoch.Add(-time.Hour))
	okID, okKey := insertExport(t, db, acc.ID, epoch.Add(-time.Hour))
	store := newFakeStore(badKey, okKey)
	store.failOn = badKey
	sw := sweep.New(db, store, nil, func() time.Time { return epoch })

	n, err := sw.Run(ctx)
	if err == nil || n != 1 {
		t.Fatalf("n=%d err=%v, want 1 and an error", n, err)
	}
	if status(t, db, badID) != "done" || status(t, db, okID) != "expired" {
		t.Fatal("a failed delete must leave the job done and not block the others")
	}
	store.failOn = ""
	if n, err = sw.Run(ctx); err != nil || n != 1 || status(t, db, badID) != "expired" {
		t.Fatalf("retry: n=%d err=%v", n, err)
	}
}

func TestHandleRunsSweep(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db)
	id, key := insertExport(t, db, acc.ID, epoch.Add(-time.Minute))
	sw := sweep.New(db, newFakeStore(key), nil, func() time.Time { return epoch })
	if err := sw.Handle(context.Background(), sweep.TaskType, nil); err != nil {
		t.Fatal(err)
	}
	if status(t, db, id) != "expired" {
		t.Fatal("handler did not expire the export")
	}
}

func TestSchedule(t *testing.T) {
	if sweep.Spec != "0 3 * * *" || sweep.Timezone != "Asia/Bangkok" {
		t.Fatalf("schedule = %q in %q", sweep.Spec, sweep.Timezone)
	}
	s, err := sweep.NewScheduler("redis://localhost:6379")
	if err != nil || s == nil {
		t.Fatalf("NewScheduler: %v", err)
	}
	if _, err := sweep.NewScheduler("not a url"); err == nil {
		t.Fatal("want an error for a bad url")
	}
}
