// Package sweep deletes export files past their 7-day expiry and marks the
// jobs expired. It runs daily at 03:00 Asia/Bangkok from an asynq scheduler.
// A run is idempotent: a file that is already gone is not an error, and a
// job that is already expired is not selected again.
package sweep

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/hibiken/asynq"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

const (
	// TaskType is the asynq task type of the sweep.
	TaskType = "sweep:exports"
	// Spec is the cron schedule: every day at 03:00.
	Spec = "0 3 * * *"
	// Timezone is the zone Spec is read in.
	Timezone = "Asia/Bangkok"
)

// Store is the part of the S3 adapter the sweep uses. Delete of a missing
// key must not fail.
type Store interface {
	Delete(ctx context.Context, key string) error
}

// Sweeper deletes expired export files.
type Sweeper struct {
	db    dal.DBTX
	store Store
	log   *slog.Logger
	now   func() time.Time
}

// New returns a Sweeper. now is the clock; nil means time.Now.
func New(db dal.DBTX, store Store, l *slog.Logger, now func() time.Time) *Sweeper {
	if now == nil {
		now = time.Now
	}
	if l == nil {
		l = slog.Default()
	}
	return &Sweeper{db: db, store: store, log: l, now: now}
}

// Run sweeps once and returns how many exports it expired. It carries on
// after a failure on one export and returns the failures joined, so the
// task is retried and the rest still got swept.
func (s *Sweeper) Run(ctx context.Context) (int, error) {
	q := sqlc.New(s.db)
	rows, err := q.ListExpiredExports(ctx, s.now())
	if err != nil {
		return 0, fmt.Errorf("sweep: list expired: %w", err)
	}
	var errs []error
	n := 0
	for _, r := range rows {
		if err := ctx.Err(); err != nil {
			return n, errors.Join(append(errs, err)...)
		}
		// Delete first: if the status update fails, the next run finds
		// the job again and the repeated delete is harmless.
		if err := s.store.Delete(ctx, r.ObjectKey.String); err != nil {
			errs = append(errs, fmt.Errorf("sweep: delete %s: %w", r.ID, err))
			continue
		}
		// Zero rows means another run expired it first.
		if _, err := q.MarkJobExpired(ctx, r.ID); err != nil {
			errs = append(errs, fmt.Errorf("sweep: mark expired %s: %w", r.ID, err))
			continue
		}
		n++
	}
	s.log.Info("export sweep done", "expired", n, "failed", len(errs))
	return n, errors.Join(errs...)
}

// Handle is the queue handler for TaskType.
func (s *Sweeper) Handle(ctx context.Context, _ string, _ []byte) error {
	_, err := s.Run(ctx)
	return err
}

// Scheduler enqueues the sweep task on its cron schedule.
type Scheduler struct{ s *asynq.Scheduler }

// NewScheduler returns a Scheduler on the Valkey at rawURL (redis://...).
// Start it once per deployment; the sweep itself is idempotent, so a second
// scheduler only repeats it.
func NewScheduler(rawURL string) (*Scheduler, error) {
	o, err := asynq.ParseRedisURI(rawURL)
	if err != nil {
		return nil, fmt.Errorf("sweep: parse url: %w", err)
	}
	ro, ok := o.(asynq.RedisClientOpt)
	if !ok {
		return nil, errors.New("sweep: only single-node redis:// urls are supported")
	}
	loc, err := time.LoadLocation(Timezone)
	if err != nil {
		return nil, fmt.Errorf("sweep: load %s: %w", Timezone, err)
	}
	sch := asynq.NewScheduler(ro, &asynq.SchedulerOpts{Location: loc})
	if _, err := sch.Register(Spec, asynq.NewTask(TaskType, nil), asynq.Queue(queue.Exports)); err != nil {
		return nil, fmt.Errorf("sweep: register: %w", err)
	}
	if _, err := sch.Register(StuckSpec, asynq.NewTask(StuckTaskType, nil), asynq.Queue(queue.Exports)); err != nil {
		return nil, fmt.Errorf("sweep: register stuck jobs: %w", err)
	}
	return &Scheduler{s: sch}, nil
}

// Start runs the scheduler in the background.
func (s *Scheduler) Start() error { return s.s.Start() }

// Shutdown stops the scheduler.
func (s *Scheduler) Shutdown() { s.s.Shutdown() }
