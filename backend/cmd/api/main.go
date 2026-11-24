// Command api serves the HTTP API.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	apihttp "github.com/suppakorn-tae/cre-website/backend/internal/http"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/httpserver"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
)

func main() {
	cfg, err := config.LoadAPI(os.LookupEnv)
	if err != nil {
		// The logger is not configured yet; still emit one JSON line to stderr.
		l := log.New(os.Stderr, "error")
		l.Error("invalid configuration, exiting", "error", err.Error())
		os.Exit(1)
	}
	l := log.New(os.Stdout, cfg.LogLevel)

	hc := health.New(2 * time.Second)
	dbAddr, err := health.HostPortFromURL(cfg.DatabaseURL, "5432")
	if err != nil {
		l.Error("invalid DATABASE_URL, exiting", "error", err.Error())
		os.Exit(1)
	}
	hc.Add("db", health.TCP(dbAddr))
	// VALKEY_ADDR is host:port. The real client replaces this check later.
	hc.Add("valkey", health.TCP(cfg.ValkeyAddr))

	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: apihttp.NewRouter(apihttp.Deps{
			Logger:         l,
			Metrics:        metrics.New(),
			Health:         hc,
			TrustedProxies: cfg.TrustedProxies,
			RequestTimeout: cfg.RequestTimeout,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	if err := httpserver.ListenAndServe(ctx, srv, cfg.ShutdownTimeout, l); err != nil {
		l.Error("api stopped with error", "error", err.Error())
		os.Exit(1)
	}
}
