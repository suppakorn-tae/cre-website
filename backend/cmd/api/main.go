// Command api serves the HTTP API.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	apihttp "github.com/suppakorn-tae/cre-website/backend/internal/http"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/dbrole"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/httpserver"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/versions"
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
	if err := dbrole.Check(ctx, pool, cfg.RequireAppRole, l); err != nil {
		l.Error("unsafe database role, exiting", "error", err.Error())
		os.Exit(1)
	}
	cache, err := valkey.New(valkeyURL(cfg.ValkeyAddr))
	if err != nil {
		l.Error("invalid VALKEY_ADDR, exiting", "error", err.Error())
		os.Exit(1)
	}
	defer func() { _ = cache.Close() }()

	deps := apihttp.Deps{Deps: app.Deps{Config: cfg, Logger: l}}
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

	cat := catalogue.New(catalogue.PGRepository{DB: pool}, cache, l)
	if err := cat.Start(ctx); err != nil {
		l.Error("cannot listen for catalogue changes, exiting", "error", err.Error())
		os.Exit(1)
	}
	deps.Catalogue = cat
	deps.Rounding = versions.Rounding{
		ScoreDecimals: decimals("SCORE_DECIMALS", 2, l),
		RMDecimals:    decimals("RM_DECIMALS", 3, l),
	}
	deps.Deps.Rounding = deps.Rounding // the handlers built from app.Deps read this copy
	if ep := os.Getenv("S3_ENDPOINT"); ep != "" {
		store, err := s3.New(s3.Config{
			Endpoint: ep, Region: os.Getenv("S3_REGION"), Bucket: os.Getenv("S3_BUCKET"),
			AccessKey: os.Getenv("S3_ACCESS_KEY"), SecretKey: os.Getenv("S3_SECRET_KEY"),
		})
		if err != nil {
			l.Error("invalid S3 settings, exiting", "error", err.Error())
			os.Exit(1)
		}
		store.EnsureBucketLogged(context.Background(), l)
		enq, err := queue.NewClient(valkeyURL(cfg.ValkeyAddr))
		if err != nil {
			l.Error("cannot create the queue client, exiting", "error", err.Error())
			os.Exit(1)
		}
		defer func() { _ = enq.Close() }()
		deps.FileStore, deps.Enqueuer = store, enq
	} else {
		l.Warn("S3_ENDPOINT is not set: report endpoints are unavailable")
	}

	hc := health.New(2 * time.Second)
	dbAddr, err := health.HostPortFromURL(cfg.DatabaseURL, "5432")
	if err != nil {
		l.Error("invalid DATABASE_URL, exiting", "error", err.Error())
		os.Exit(1)
	}
	hc.Add("db", health.TCP(dbAddr))
	hc.Add("valkey", cache.Check)

	deps.Metrics, deps.Health = metrics.New(), hc
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           apihttp.NewRouter(deps),
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

// decimals reads SCORE_DECIMALS or RM_DECIMALS (0 to 6), falling back to def
// with a warning when the value is missing or invalid.
func decimals(key string, def int16, l *slog.Logger) int16 {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 8)
	if err != nil || n < 0 || n > 6 {
		l.Warn("invalid decimals, using the default", "key", key, "default", def)
		return def
	}
	return int16(n)
}
