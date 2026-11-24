// Command worker runs background jobs. Until the asynq adapter lands it only
// serves probes and metrics and shuts down cleanly on SIGTERM.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/httpserver"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
)

func main() {
	cfg, err := config.LoadWorker(os.LookupEnv)
	if err != nil {
		log.New(os.Stderr, "error").Error("invalid configuration, exiting", "error", err.Error())
		os.Exit(1)
	}
	l := log.New(os.Stdout, cfg.LogLevel)

	hc := health.New(2 * time.Second)
	addr, err := health.HostPortFromURL(cfg.DatabaseURL, "5432")
	if err != nil {
		l.Error("invalid DATABASE_URL, exiting", "error", err.Error())
		os.Exit(1)
	}
	hc.Add("db", health.TCP(addr))
	hc.Add("valkey", health.TCP(cfg.ValkeyAddr))

	m := metrics.New()
	r := chi.NewRouter()
	r.Method(http.MethodGet, "/healthz", hc.Healthz())
	r.Method(http.MethodGet, "/readyz", hc.Readyz())
	r.Method(http.MethodGet, "/metrics", m.Handler())
	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: r, ReadHeaderTimeout: 10 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	if err := httpserver.ListenAndServe(ctx, srv, cfg.ShutdownTimeout, l); err != nil {
		l.Error("worker stopped with error", "error", err.Error())
		os.Exit(1)
	}
}
