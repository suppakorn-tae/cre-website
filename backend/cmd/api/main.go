// Command api serves the HTTP API.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	apihttp "github.com/suppakorn-tae/cre-website/backend/internal/http"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
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

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		l.Error("cannot create the database pool, exiting", "error", err.Error())
		os.Exit(1)
	}
	defer pool.Close()
	cache, err := valkey.New(valkeyURL(cfg.ValkeyAddr))
	if err != nil {
		l.Error("invalid VALKEY_ADDR, exiting", "error", err.Error())
		os.Exit(1)
	}
	defer func() { _ = cache.Close() }()

	deps := app.Deps{Config: cfg, Logger: l}
	if cfg.SMTPHost != "" {
		m, err := mailer.NewSMTP(mailer.Config{
			Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser,
			Password: cfg.SMTPPassword, From: cfg.SMTPFrom, RequireTLS: cfg.SMTPRequireTLS,
		})
		if err != nil {
			l.Error("invalid SMTP settings, exiting", "error", err.Error())
			os.Exit(1)
		}
		deps.Mailer = m
	} else {
		l.Warn("SMTP_HOST is not set: e-mail sign-up is unavailable")
	}
	if err := deps.WireAuth(pool, cache); err != nil {
		l.Error("cannot wire authentication, exiting", "error", err.Error())
		os.Exit(1)
	}

	hc := health.New(2 * time.Second)
	dbAddr, err := health.HostPortFromURL(cfg.DatabaseURL, "5432")
	if err != nil {
		l.Error("invalid DATABASE_URL, exiting", "error", err.Error())
		os.Exit(1)
	}
	hc.Add("db", health.TCP(dbAddr))
	hc.Add("valkey", cache.Check)

	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: apihttp.NewRouter(apihttp.Deps{
			Deps:    deps,
			Metrics: metrics.New(),
			Health:  hc,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	if err := httpserver.ListenAndServe(ctx, srv, cfg.ShutdownTimeout, l, hc.SetDraining); err != nil {
		l.Error("api stopped with error", "error", err.Error())
		os.Exit(1)
	}
}

// valkeyURL turns VALKEY_ADDR (host:port) into the redis:// URL the client
// parses; a value that already has a scheme is kept.
func valkeyURL(addr string) string {
	if strings.Contains(addr, "://") {
		return addr
	}
	return "redis://" + addr
}
