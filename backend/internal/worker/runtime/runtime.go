// Package runtime is the worker runtime: it runs one handler per job kind on
// the asynq server, keeps the job row in step and re-enqueues unfinished jobs
// on start-up.
package runtime

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

// Environment variables for the per-queue concurrency.
const (
	EnvReportsConcurrency = "WORKER_REPORTS_CONCURRENCY"
	EnvExportsConcurrency = "WORKER_EXPORTS_CONCURRENCY"
)

// ConcurrencyFromEnv reads the per-queue concurrency; unset means the
// queue adapter default.
func ConcurrencyFromEnv(get func(string) (string, bool)) (map[string]int, error) {
	out := queue.DefaultConcurrency()
	var errs []error
	for q, key := range map[string]string{queue.Reports: EnvReportsConcurrency, queue.Exports: EnvExportsConcurrency} {
		v, ok := get(key)
		if !ok || v == "" {
			continue
		}
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			errs = append(errs, fmt.Errorf("%s: %q is not a positive integer", key, v))
			continue
		}
		out[q] = n
	}
	return out, errors.Join(errs...)
}

// Runner does the work of one job. A nil return marks the job done; an error
// marks it failed, unless the context was cancelled (shutdown), when the job
// stays running and asynq puts the task back.
type Runner func(ctx context.Context, j jobs.Job) error

// Server is the part of queue.Server the runtime uses.
type Server interface {
	Handle(kind string, h queue.Handler)
	Start() error
	Stop()
}

// Store is the part of jobs.Service the runtime uses.
type Store interface {
	MarkRunning(ctx context.Context, id uuid.UUID) (jobs.Job, error)
	MarkDone(ctx context.Context, j jobs.Job) error
	MarkFailed(ctx context.Context, id uuid.UUID, msg string) error
	Requeue(ctx context.Context) (int, error)
}

// Runtime wires runners to the queue server.
type Runtime struct {
	store Store
	srv   Server
	log   *slog.Logger
}

// New returns a Runtime.
func New(store Store, srv Server, l *slog.Logger) *Runtime {
	return &Runtime{store: store, srv: srv, log: l}
}

// Register sets the runner for a job kind. Call it before Start.
func (r *Runtime) Register(kind jobs.Kind, run Runner) {
	r.srv.Handle(string(kind), func(ctx context.Context, _ string, payload []byte) error {
		return r.handle(ctx, run, payload)
	})
}

// Start begins processing and then re-enqueues jobs left queued or running.
func (r *Runtime) Start(ctx context.Context) error {
	if err := r.srv.Start(); err != nil {
		return fmt.Errorf("runtime: start: %w", err)
	}
	n, err := r.store.Requeue(ctx)
	if err != nil {
		return fmt.Errorf("runtime: requeue: %w", err)
	}
	r.log.Info("requeued unfinished jobs", "count", n)
	return nil
}

// Stop stops fetching and waits for running jobs (asynq then puts back what
// is still running).
func (r *Runtime) Stop() { r.srv.Stop() }

func (r *Runtime) handle(ctx context.Context, run Runner, payload []byte) error {
	id, err := uuid.ParseBytes(payload)
	if err != nil {
		// A malformed task can never succeed; drop it instead of retrying.
		r.log.Error("job task has a bad payload", "error", err.Error())
		return nil
	}
	j, err := r.store.MarkRunning(ctx, id)
	if errors.Is(err, jobs.ErrNotRunnable) {
		return nil // finished already: a duplicate task
	}
	if err != nil {
		return err // transient: asynq retries
	}
	if err := run(ctx, j); err != nil {
		if ctx.Err() != nil {
			return ctx.Err() // shutdown: leave it running, asynq re-queues
		}
		r.log.Error("job failed", "job", id.String(), "kind", string(j.Kind), "error", err.Error())
		if ferr := r.store.MarkFailed(context.WithoutCancel(ctx), id, err.Error()); ferr != nil {
			return ferr
		}
		return nil
	}
	return r.store.MarkDone(context.WithoutCancel(ctx), j)
}
