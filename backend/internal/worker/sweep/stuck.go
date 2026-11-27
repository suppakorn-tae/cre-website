package sweep

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

const (
	// StuckTaskType is the asynq task type of the stuck-job sweep.
	StuckTaskType = "sweep:stuck-jobs"
	// StuckSpec is the cron schedule: every 10 minutes.
	StuckSpec = "*/10 * * * *"
	// StuckError is the message stored on a job the sweep ends.
	StuckError = "timed out"
)

// StuckLimits are the time limits the stuck-job sweep applies.
type StuckLimits struct {
	// Report and Export are the run time limits of the worker for each kind.
	Report, Export time.Duration
	// Margin is added to a limit, so a job the worker is about to time out
	// itself is never failed by the sweep first.
	Margin time.Duration
	// QueuedMax is how long a job may stay queued.
	QueuedMax time.Duration
}

// Stuck fails jobs that a crashed or killed worker left running, and jobs
// that stayed queued far too long. A web page that polls a job then sees a
// final status.
type Stuck struct {
	db  dal.DBTX
	lim StuckLimits
	log *slog.Logger
	now func() time.Time
}

// NewStuck returns a Stuck sweep. now is the clock; nil means time.Now.
func NewStuck(db dal.DBTX, lim StuckLimits, l *slog.Logger, now func() time.Time) *Stuck {
	if now == nil {
		now = time.Now
	}
	if l == nil {
		l = slog.Default()
	}
	return &Stuck{db: db, lim: lim, log: l, now: now}
}

// Run fails the stuck jobs once and returns how many it failed. It is
// idempotent: a failed job is not selected again.
func (s *Stuck) Run(ctx context.Context) (int, error) {
	now := s.now()
	rows, err := sqlc.New(s.db).FailStuckJobs(ctx, sqlc.FailStuckJobsParams{
		Now:          now,
		ReportCutoff: now.Add(-(s.lim.Report + s.lim.Margin)),
		ExportCutoff: now.Add(-(s.lim.Export + s.lim.Margin)),
		QueuedCutoff: now.Add(-s.lim.QueuedMax),
	})
	if err != nil {
		return 0, fmt.Errorf("sweep: fail stuck jobs: %w", err)
	}
	for _, r := range rows {
		s.log.Warn("stuck job failed", "job_id", r.ID, "kind", string(r.Kind), "started_at", r.StartedAt)
	}
	return len(rows), nil
}

// Handle is the queue handler for StuckTaskType.
func (s *Stuck) Handle(ctx context.Context, _ string, _ []byte) error {
	_, err := s.Run(ctx)
	return err
}
