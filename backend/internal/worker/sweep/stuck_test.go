package sweep_test

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/sweep"
)

var stuckLimits = sweep.StuckLimits{
	Report:    5 * time.Minute,
	Export:    25 * time.Minute,
	Margin:    10 * time.Minute,
	QueuedMax: 6 * time.Hour,
}

func insertJob(t *testing.T, db testutil.DB, requester, kind, status string, created time.Time, started *time.Time) uuid.UUID {
	t.Helper()
	id := uuid.New()
	var finished *time.Time
	_, err := db.Exec(context.Background(), `
		INSERT INTO job (id, kind, requested_by, status, created_at, started_at, finished_at)
		VALUES ($1, $2::job_kind, $3, $4::job_status, $5, $6, $7)`,
		id, kind, requester, status, created, started, finished)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestStuckSweepFailsOnlyJobsPastTheirLimit(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)
	acc := testutil.NewAccount(t, db)
	now := epoch
	ago := func(d time.Duration) *time.Time { v := now.Add(-d); return &v }

	// Limit plus margin: report 15 min, export 35 min.
	deadReport := insertJob(t, db, acc.ID, "report", "running", *ago(time.Hour), ago(16*time.Minute))
	liveReport := insertJob(t, db, acc.ID, "report", "running", *ago(time.Hour), ago(14*time.Minute))
	deadExport := insertJob(t, db, acc.ID, "export", "running", *ago(2 * time.Hour), ago(36*time.Minute))
	liveExport := insertJob(t, db, acc.ID, "export", "running", *ago(2 * time.Hour), ago(30*time.Minute))
	oldQueued := insertJob(t, db, acc.ID, "export", "queued", *ago(7 * time.Hour), nil)
	freshQueued := insertJob(t, db, acc.ID, "export", "queued", *ago(5 * time.Hour), nil)

	var buf bytes.Buffer
	l := slog.New(slog.NewTextHandler(&buf, nil))
	sw := sweep.NewStuck(db, stuckLimits, l, (&fakeClock{t: now}).Now)

	n, err := sw.Run(ctx)
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v, want 3, nil", n, err)
	}
	for id, want := range map[uuid.UUID]string{
		deadReport: "failed", liveReport: "running", deadExport: "failed",
		liveExport: "running", oldQueued: "failed", freshQueued: "queued",
	} {
		if got := status(t, db, id); got != want {
			t.Errorf("job %s status = %s, want %s", id, got, want)
		}
	}
	var msg string
	if err := db.QueryRow(ctx, `SELECT error FROM job WHERE id = $1`, deadExport).Scan(&msg); err != nil || msg != "timed out" {
		t.Fatalf("error = %q, %v, want timed out", msg, err)
	}
	for _, id := range []uuid.UUID{deadReport, deadExport, oldQueued} {
		if !strings.Contains(buf.String(), id.String()) {
			t.Errorf("log does not name job %s: %s", id, buf.String())
		}
	}
	if !strings.Contains(buf.String(), "kind=export") || !strings.Contains(buf.String(), "kind=report") {
		t.Errorf("log does not name the kinds: %s", buf.String())
	}

	// A second run changes nothing.
	if n, err := sw.Run(ctx); err != nil || n != 0 {
		t.Fatalf("second run: n=%d err=%v", n, err)
	}
}
