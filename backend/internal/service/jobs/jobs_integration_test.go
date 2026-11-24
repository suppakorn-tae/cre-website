package jobs_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
)

type recorder struct {
	mu   sync.Mutex
	sent []string
}

func (r *recorder) Enqueue(_ context.Context, kind string, payload []byte, q string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, kind+" "+string(payload)+" "+q)
	return nil
}

func setup(t *testing.T) (*pgxpool.Pool, *jobs.Service, *recorder, uuid.UUID) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	rec := &recorder{}
	acct := testutil.NewAccount(t, pool)
	return pool, jobs.New(pool, rec), rec, uuid.MustParse(acct.ID)
}

func TestLifecycleAndOwnerCheck(t *testing.T) {
	ctx := context.Background()
	_, svc, rec, owner := setup(t)

	j, err := svc.Create(ctx, jobs.KindExport, owner)
	if err != nil {
		t.Fatal(err)
	}
	if j.Status != jobs.StatusQueued || len(rec.sent) != 1 || rec.sent[0] != "export "+j.ID.String()+" exports" {
		t.Fatalf("job=%+v sent=%v", j, rec.sent)
	}

	if _, err := svc.GetForRequester(ctx, j.ID, uuid.New()); !errors.Is(err, jobs.ErrNotFound) {
		t.Fatalf("other account: err = %v, want ErrNotFound", err)
	}
	if _, err := svc.GetForRequester(ctx, j.ID, owner); err != nil {
		t.Fatalf("owner: %v", err)
	}

	running, err := svc.MarkRunning(ctx, j.ID)
	if err != nil || running.Status != jobs.StatusRunning || running.StartedAt == nil {
		t.Fatalf("running=%+v err=%v", running, err)
	}
	if err := svc.MarkDone(ctx, running); err != nil {
		t.Fatal(err)
	}
	done, _ := svc.GetForRequester(ctx, j.ID, owner)
	if done.Status != jobs.StatusDone || done.ObjectKey == nil || *done.ObjectKey != "exports/"+j.ID.String()+".zip" || done.ExpiresAt == nil {
		t.Fatalf("done=%+v", done)
	}
	if _, err := svc.MarkRunning(ctx, j.ID); !errors.Is(err, jobs.ErrNotRunnable) {
		t.Fatalf("finished job must not run again: %v", err)
	}
	if err := svc.MarkExpired(ctx, j.ID); err != nil {
		t.Fatal(err)
	}
}

func TestReportFailure(t *testing.T) {
	ctx := context.Background()
	_, svc, _, owner := setup(t)
	j, err := svc.Create(ctx, jobs.KindReport, owner)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.MarkFailed(ctx, j.ID, "gotenberg down"); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.GetForRequester(ctx, j.ID, owner)
	if got.Status != jobs.StatusFailed || got.Error == nil || *got.Error != "gotenberg down" || got.FinishedAt == nil {
		t.Fatalf("got=%+v", got)
	}
}

func TestInsertRollsBackWithCallerTx(t *testing.T) {
	ctx := context.Background()
	pool, svc, rec, owner := setup(t)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	j, err := svc.Insert(ctx, tx, jobs.KindReport, owner)
	if err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback(ctx)
	if _, err := svc.GetForRequester(ctx, j.ID, owner); !errors.Is(err, jobs.ErrNotFound) {
		t.Fatalf("rolled back row visible: %v", err)
	}
	if len(rec.sent) != 0 {
		t.Fatalf("nothing may be enqueued before commit, got %v", rec.sent)
	}
}

func startValkey(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "valkey/valkey:8-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor:   wait.ForLog("Ready to accept connections").WithStartupTimeout(time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start valkey: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	ep, err := ctr.PortEndpoint(ctx, "6379/tcp", "redis")
	if err != nil {
		t.Fatal(err)
	}
	return ep
}

// A worker killed mid-job leaves the row running and, if Valkey lost its
// state, no task. The restarted worker re-enqueues the job and finishes it.
func TestRestartedWorkerCompletesInterruptedJob(t *testing.T) {
	ctx := context.Background()
	pool, svc, _, owner := setup(t)
	url := startValkey(t)

	// The job as the killed worker left it: running, nothing in the queue.
	j, err := svc.Insert(ctx, pool, jobs.KindReport, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.MarkRunning(ctx, j.ID); err != nil {
		t.Fatal(err)
	}

	enq, err := queue.NewClient(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = enq.Close() })
	srv, err := queue.NewServer(queue.ServerConfig{RedisURL: url, Concurrency: queue.DefaultConcurrency()})
	if err != nil {
		t.Fatal(err)
	}
	ran := make(chan struct{}, 1)
	rt := runtime.New(jobs.New(pool, enq), srv, slog.New(slog.NewTextHandler(io.Discard, nil)))
	rt.Register(jobs.KindReport, func(context.Context, jobs.Job) error { ran <- struct{}{}; return nil })
	if err := rt.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(rt.Stop)

	select {
	case <-ran:
	case <-time.After(30 * time.Second):
		t.Fatal("restarted worker did not run the job")
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		got, err := svc.GetForRequester(ctx, j.ID, owner)
		if err != nil {
			t.Fatal(err)
		}
		if got.Status == jobs.StatusDone {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("status = %s, want done", got.Status)
		}
		time.Sleep(100 * time.Millisecond)
	}
}
