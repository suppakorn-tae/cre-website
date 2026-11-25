// Command worker runs background jobs (reports and exports) from the asynq
// queues, and serves probes and metrics. On SIGTERM it stops taking jobs and
// lets running ones finish; asynq re-queues whatever is still running.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/httpserver"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/export"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/report"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/sweep"
)

func main() {
	os.Exit(run())
}

// schedulerEnabled reports whether this replica runs the cron scheduler.
// It is on unless SCHEDULER_ENABLED is a false value.
func schedulerEnabled(get func(string) (string, bool)) bool {
	v, _ := get("SCHEDULER_ENABLED")
	on, err := strconv.ParseBool(strings.TrimSpace(v))
	return err != nil || on
}

func run() int {
	cfg, err := config.LoadWorker(os.LookupEnv)
	if err != nil {
		log.New(os.Stderr, "error").Error("invalid configuration, exiting", "error", err.Error())
		return 1
	}
	l := log.New(os.Stdout, cfg.LogLevel)
	fail := func(msg string, err error) int {
		l.Error(msg, "error", err.Error())
		return 1
	}

	gotenbergURL, _ := os.LookupEnv("GOTENBERG_URL")
	if gotenbergURL == "" {
		l.Error("GOTENBERG_URL is required but not set, exiting")
		return 1
	}
	conc, err := runtime.ConcurrencyFromEnv(os.LookupEnv)
	if err != nil {
		return fail("invalid worker concurrency, exiting", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fail("invalid DATABASE_URL, exiting", err)
	}
	defer pool.Close()

	valkeyURL := cfg.ValkeyAddr
	if !strings.Contains(valkeyURL, "://") {
		valkeyURL = "redis://" + valkeyURL
	}
	vk, err := valkey.New(valkeyURL)
	if err != nil {
		return fail("invalid VALKEY_ADDR, exiting", err)
	}
	defer func() { _ = vk.Close() }()
	enq, err := queue.NewClient(valkeyURL)
	if err != nil {
		return fail("queue client, exiting", err)
	}
	defer func() { _ = enq.Close() }()
	srv, err := queue.NewServer(queue.ServerConfig{RedisURL: valkeyURL, Concurrency: conc})
	if err != nil {
		return fail("queue server, exiting", err)
	}

	hc := health.New(2 * time.Second)
	hc.Add("db", pool.Ping)
	hc.Add("valkey", vk.Check)
	hc.Add("gotenberg", pdf.New(gotenbergURL).Ready)

	store, err := s3.New(s3.Config{
		Endpoint: os.Getenv("S3_ENDPOINT"), Region: os.Getenv("S3_REGION"), Bucket: os.Getenv("S3_BUCKET"),
		AccessKey: os.Getenv("S3_ACCESS_KEY"), SecretKey: os.Getenv("S3_SECRET_KEY"),
	})
	if err != nil {
		return fail("invalid S3 settings, exiting", err)
	}

	store.EnsureBucketLogged(ctx, l)
	// The sweep is a plain queue task, not a job kind.
	srv.Handle(sweep.TaskType, sweep.New(pool, store, l, nil).Handle)

	// One runner per job kind.
	rt := runtime.New(jobs.New(pool, enq), srv, l)
	rt.Register(jobs.KindReport, report.NewRunner(report.NewStore(pool), pdf.New(gotenbergURL), store))
	rt.Register(jobs.KindExport, export.NewRunner(export.NewRepository(pool), store))
	if err := rt.Start(ctx); err != nil {
		return fail("worker runtime, exiting", err)
	}

	// Run the cron scheduler on one replica only; set SCHEDULER_ENABLED=false
	// on the others. Every replica still handles the task.
	if schedulerEnabled(os.LookupEnv) {
		sch, err := sweep.NewScheduler(valkeyURL)
		if err != nil {
			rt.Stop()
			return fail("sweep scheduler, exiting", err)
		}
		if err := sch.Start(); err != nil {
			rt.Stop()
			return fail("sweep scheduler start, exiting", err)
		}
		defer sch.Shutdown()
		l.Info("scheduler started", "task", sweep.TaskType, "spec", sweep.Spec, "timezone", sweep.Timezone)
	} else {
		l.Info("scheduler disabled by SCHEDULER_ENABLED")
	}

	r := chi.NewRouter()
	r.Method(http.MethodGet, "/healthz", hc.Healthz())
	r.Method(http.MethodGet, "/readyz", hc.Readyz())
	r.Method(http.MethodGet, "/metrics", metrics.New().Handler())
	httpSrv := &http.Server{Addr: cfg.HTTPAddr, Handler: r, ReadHeaderTimeout: 10 * time.Second}

	err = httpserver.ListenAndServe(ctx, httpSrv, cfg.ShutdownTimeout, l, hc.SetDraining)
	rt.Stop()
	if err != nil {
		return fail("worker stopped with error", err)
	}
	return 0
}
