package runtime

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

type fakeStore struct {
	job      jobs.Job
	runErr   error
	doneErr  error
	done     bool
	failed   string
	requeued int
}

func (f *fakeStore) MarkRunning(context.Context, uuid.UUID) (jobs.Job, error) {
	return f.job, f.runErr
}

func (f *fakeStore) MarkDone(context.Context, jobs.Job) error {
	if f.doneErr != nil {
		return f.doneErr
	}
	f.done = true
	return nil
}

func (f *fakeStore) MarkFailed(_ context.Context, _ uuid.UUID, msg string) error {
	f.failed = msg
	return nil
}

func (f *fakeStore) Requeue(context.Context) (int, error) { f.requeued++; return 0, nil }

type fakeServer struct {
	handlers map[string]queue.Handler
	started  bool
}

func (s *fakeServer) Handle(kind string, h queue.Handler) {
	if s.handlers == nil {
		s.handlers = map[string]queue.Handler{}
	}
	s.handlers[kind] = h
}
func (s *fakeServer) Start() error { s.started = true; return nil }
func (s *fakeServer) Stop()        {}

func setup(st *fakeStore, run Runner) (*Runtime, *fakeServer) {
	srv := &fakeServer{}
	rt := New(st, srv, slog.New(slog.NewTextHandler(io.Discard, nil)))
	rt.Register(jobs.KindReport, run)
	return rt, srv
}

func fire(ctx context.Context, srv *fakeServer) error {
	return srv.handlers["report"](ctx, "report", []byte(uuid.NewString()))
}

func TestSuccessMarksDone(t *testing.T) {
	st := &fakeStore{job: jobs.Job{Kind: jobs.KindReport}}
	_, srv := setup(st, func(context.Context, jobs.Job) error { return nil })
	if err := fire(context.Background(), srv); err != nil || !st.done {
		t.Fatalf("err=%v done=%v, want done", err, st.done)
	}
}

func TestOnDoneRunsOnlyAfterMarkDone(t *testing.T) {
	st := &fakeStore{job: jobs.Job{Kind: jobs.KindReport}}
	var calls []bool // st.done at each hook call
	_, srv := setup(st, func(ctx context.Context, _ jobs.Job) error {
		if !OnDone(ctx, func(ctx context.Context) { calls = append(calls, st.done && ctx.Err() == nil) }) {
			t.Error("OnDone = false inside the runtime")
		}
		return nil
	})
	if err := fire(context.Background(), srv); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 1 || !calls[0] {
		t.Fatalf("calls = %v, want one call after the job is done", calls)
	}
}

func TestOnDoneSkippedWhenJobNotDone(t *testing.T) {
	for name, st := range map[string]*fakeStore{
		"runner failed":    {job: jobs.Job{Kind: jobs.KindReport}},
		"mark done failed": {job: jobs.Job{Kind: jobs.KindReport}, doneErr: errors.New("db down")},
	} {
		t.Run(name, func(t *testing.T) {
			called := false
			_, srv := setup(st, func(ctx context.Context, _ jobs.Job) error {
				OnDone(ctx, func(context.Context) { called = true })
				if st.doneErr == nil {
					return errors.New("boom")
				}
				return nil
			})
			_ = fire(context.Background(), srv)
			if called {
				t.Fatal("hook ran for a job that is not done")
			}
		})
	}
}

func TestOnDoneOutsideRuntime(t *testing.T) {
	if OnDone(context.Background(), func(context.Context) {}) {
		t.Fatal("OnDone = true without a runtime")
	}
}

func TestRunnerErrorMarksFailedWithoutRetry(t *testing.T) {
	st := &fakeStore{job: jobs.Job{Kind: jobs.KindReport}}
	_, srv := setup(st, func(context.Context, jobs.Job) error { return errors.New("boom") })
	if err := fire(context.Background(), srv); err != nil {
		t.Fatalf("err = %v, want nil so asynq does not retry", err)
	}
	if st.failed != "boom" || st.done {
		t.Fatalf("failed=%q done=%v", st.failed, st.done)
	}
}

func TestShutdownLeavesJobRunning(t *testing.T) {
	st := &fakeStore{job: jobs.Job{Kind: jobs.KindReport}}
	ctx, cancel := context.WithCancel(context.Background())
	_, srv := setup(st, func(ctx context.Context, _ jobs.Job) error {
		cancel()
		return ctx.Err()
	})
	if err := fire(ctx, srv); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled so asynq re-queues", err)
	}
	if st.failed != "" || st.done {
		t.Fatalf("job must stay running: failed=%q done=%v", st.failed, st.done)
	}
}

func TestFinishedJobIsSkipped(t *testing.T) {
	st := &fakeStore{runErr: jobs.ErrNotRunnable}
	ran := false
	_, srv := setup(st, func(context.Context, jobs.Job) error { ran = true; return nil })
	if err := fire(context.Background(), srv); err != nil || ran {
		t.Fatalf("err=%v ran=%v, want skipped", err, ran)
	}
}

func TestStartRequeues(t *testing.T) {
	st := &fakeStore{}
	rt, srv := setup(st, func(context.Context, jobs.Job) error { return nil })
	if err := rt.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !srv.started || st.requeued != 1 {
		t.Fatalf("started=%v requeued=%d", srv.started, st.requeued)
	}
}

func TestConcurrencyFromEnv(t *testing.T) {
	env := map[string]string{EnvExportsConcurrency: "1"}
	got, err := ConcurrencyFromEnv(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil || got[queue.Exports] != 1 || got[queue.Reports] != queue.DefaultConcurrency()[queue.Reports] {
		t.Fatalf("got %v err %v", got, err)
	}
	env[EnvReportsConcurrency] = "0"
	if _, err := ConcurrencyFromEnv(func(k string) (string, bool) { v, ok := env[k]; return v, ok }); err == nil {
		t.Fatal("want error for 0")
	}
}
