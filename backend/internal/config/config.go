// Package config reads typed configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Getenv looks up an environment variable; os.LookupEnv fits.
type Getenv func(key string) (string, bool)

// Common is shared by api and worker.
type Common struct {
	DatabaseURL     string
	ValkeyAddr      string
	LogLevel        string
	ShutdownTimeout time.Duration
	// RequireAppRole (DB_REQUIRE_APP_ROLE) makes a startup error of the
	// warning about a database role that can modify audit_log. Off by default.
	RequireAppRole bool
}

// API is the api process configuration.
type API struct {
	Common
	HTTPAddr       string
	RequestTimeout time.Duration
	// TrustedProxies are the networks (Caddy) whose forwarding headers are
	// believed. Empty by default: the TCP peer is the client. Deploy sets it.
	TrustedProxies []netip.Prefix

	// Env is APP_ENV: "production" (default) or "development".
	Env string
	// SessionSecret signs session tokens (SESSION_SECRET, at least 32
	// bytes). Required in production; development without it gets a random
	// per-process secret from the caller.
	SessionSecret string
	SessionTTL    time.Duration
	RememberTTL   time.Duration
	// AllowedOrigins are the full origins (scheme and host) accepted by the
	// CSRF Origin check besides the request host. Defaults to PUBLIC_BASE_URL.
	AllowedOrigins []string

	// SMTP settings for the OTP mailer (SMTP_HOST, SMTP_PORT, SMTP_USER,
	// SMTP_PASSWORD, SMTP_FROM). SMTPHost is required in production; when it
	// is empty (development) the api starts without a mailer and every
	// route that sends e-mail answers 503.
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	// SMTPRequireTLS (SMTP_REQUIRE_TLS) fails a send when the relay does not
	// offer STARTTLS. It defaults to true when APP_ENV is production and to
	// false otherwise; an explicit value wins (Mailpit offers no STARTTLS).
	SMTPRequireTLS bool

	// MaxProjectsPerUser (MAX_PROJECTS_PER_USER) is how many live projects one
	// account may own; MaxVersionsPerProject (MAX_VERSIONS_PER_PROJECT) is how
	// many live versions one project may have. Soft-deleted rows do not count.
	MaxProjectsPerUser    int
	MaxVersionsPerProject int
}

// Defaults for the two limits above (BR-27).
const (
	DefaultMaxProjectsPerUser    = 3
	DefaultMaxVersionsPerProject = 10
)

// MinSessionSecret is the shortest accepted SESSION_SECRET in bytes.
const MinSessionSecret = 32

// Insecure reports local http development: cookies drop the Secure flag.
func (c API) Insecure() bool { return c.Env != "production" }

// Worker is the worker process configuration.
type Worker struct {
	Common
	// HTTPAddr serves /healthz, /readyz and /metrics.
	HTTPAddr string
	// ExportTimeout and ReportTimeout bound one export or report job.
	ExportTimeout, ReportTimeout time.Duration
	// StuckMargin is added to those limits before the stuck-job sweep fails
	// a job that is still running.
	StuckMargin time.Duration
	// QueuedMaxAge is how long a job may stay queued before the sweep fails it.
	QueuedMaxAge time.Duration
}

// LoadAPI reads the api configuration and reports every problem at once.
func LoadAPI(get Getenv) (API, error) {
	r := reader{get: get}
	c := API{
		Common:         r.common(),
		HTTPAddr:       r.str("HTTP_ADDR", ":4000"),
		RequestTimeout: r.duration("REQUEST_TIMEOUT", 30*time.Second),
		TrustedProxies: r.prefixes("TRUSTED_PROXIES", ""),
		Env:            strings.ToLower(r.str("APP_ENV", "production")),
	}
	switch c.Env {
	case "production", "development":
	default:
		r.errs = append(r.errs, fmt.Errorf("APP_ENV: %q is not production or development", c.Env))
	}
	c.SessionSecret = r.str("SESSION_SECRET", "")
	if (c.Env == "production" || c.SessionSecret != "") && len(c.SessionSecret) < MinSessionSecret {
		r.errs = append(r.errs, fmt.Errorf("SESSION_SECRET must be set to at least %d bytes in production", MinSessionSecret))
	}
	c.SessionTTL = r.duration("SESSION_TTL", 12*time.Hour)
	c.RememberTTL = r.duration("REMEMBER_TTL", 30*24*time.Hour)
	c.AllowedOrigins = r.origins("ALLOWED_ORIGINS", r.str("PUBLIC_BASE_URL", ""))
	c.SMTPHost = r.str("SMTP_HOST", "")
	c.SMTPPort = r.port("SMTP_PORT", 587)
	c.SMTPUser = r.str("SMTP_USER", "")
	c.SMTPPassword = r.str("SMTP_PASSWORD", "")
	c.SMTPFrom = r.str("SMTP_FROM", "")
	c.SMTPRequireTLS = r.boolean("SMTP_REQUIRE_TLS", c.Env == "production")
	if c.Env == "production" && c.SMTPHost == "" {
		r.errs = append(r.errs, errors.New("SMTP_HOST is required in production"))
	}
	if c.SMTPHost != "" && c.SMTPFrom == "" {
		r.errs = append(r.errs, errors.New("SMTP_FROM is required when SMTP_HOST is set"))
	}
	c.MaxProjectsPerUser = r.positiveInt("MAX_PROJECTS_PER_USER", DefaultMaxProjectsPerUser)
	c.MaxVersionsPerProject = r.positiveInt("MAX_VERSIONS_PER_PROJECT", DefaultMaxVersionsPerProject)
	return c, r.err()
}

// MaxTaskTimeout is the default asynq task timeout; a job time limit must stay
// under it.
const MaxTaskTimeout = 30 * time.Minute

// LoadWorker reads the worker configuration and reports every problem at once.
func LoadWorker(get Getenv) (Worker, error) {
	r := reader{get: get}
	c := Worker{
		Common:   r.common(),
		HTTPAddr: r.str("HTTP_ADDR", ":4001"),
	}
	c.ExportTimeout = r.duration("EXPORT_TIMEOUT", 25*time.Minute)
	c.ReportTimeout = r.duration("REPORT_TIMEOUT", 5*time.Minute)
	c.StuckMargin = r.duration("JOB_STUCK_MARGIN", 10*time.Minute)
	c.QueuedMaxAge = r.duration("JOB_QUEUED_MAX_AGE", 6*time.Hour)
	// asynq ends a task after MaxTaskTimeout, so a longer limit never applies.
	for _, l := range []struct {
		key string
		d   time.Duration
	}{{"EXPORT_TIMEOUT", c.ExportTimeout}, {"REPORT_TIMEOUT", c.ReportTimeout}} {
		if l.d >= MaxTaskTimeout {
			r.errs = append(r.errs, fmt.Errorf("%s: %s must be under %s, the task limit asynq sets when a job is enqueued",
				l.key, l.d, MaxTaskTimeout))
		}
	}
	return c, r.err()
}

type reader struct {
	get  Getenv
	errs []error
}

func (r *reader) err() error { return errors.Join(r.errs...) }

func (r *reader) common() Common {
	c := Common{
		DatabaseURL:     r.required("DATABASE_URL"),
		ValkeyAddr:      r.required("VALKEY_ADDR"),
		LogLevel:        strings.ToLower(r.str("LOG_LEVEL", "info")),
		ShutdownTimeout: r.duration("SHUTDOWN_TIMEOUT", 25*time.Second),
		RequireAppRole:  r.boolean("DB_REQUIRE_APP_ROLE", false),
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		r.errs = append(r.errs, fmt.Errorf("LOG_LEVEL: %q is not one of debug, info, warn, error", c.LogLevel))
	}
	return c
}

func (r *reader) required(key string) string {
	v, _ := r.get(key)
	if strings.TrimSpace(v) == "" {
		r.errs = append(r.errs, fmt.Errorf("%s is required but not set", key))
	}
	return v
}

func (r *reader) str(key, def string) string {
	if v, ok := r.get(key); ok && v != "" {
		return v
	}
	return def
}

func (r *reader) duration(key string, def time.Duration) time.Duration {
	v, ok := r.get(key)
	if !ok || v == "" {
		return def
	}
	d, err := parseDuration(v)
	if err != nil || d <= 0 {
		r.errs = append(r.errs, fmt.Errorf("%s: %q is not a positive duration", key, v))
		return def
	}
	return d
}

func (r *reader) port(key string, def int) int {
	v, ok := r.get(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > 65535 {
		r.errs = append(r.errs, fmt.Errorf("%s: %q is not a port", key, v))
		return def
	}
	return n
}

// positiveInt reads an integer of at least 1; def applies when it is unset or
// empty.
func (r *reader) positiveInt(key string, def int) int {
	v, ok := r.get(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 1 {
		r.errs = append(r.errs, fmt.Errorf("%s: %q is not a positive integer", key, v))
		return def
	}
	return n
}

// boolean reads a true/false variable; def applies when it is unset or empty.
func (r *reader) boolean(key string, def bool) bool {
	v, ok := r.get(key)
	if !ok || v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: %q is not true or false", key, v))
	}
	return b
}

func (r *reader) prefixes(key, def string) []netip.Prefix {
	var out []netip.Prefix
	for _, s := range strings.Split(r.str(key, def), ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		p, err := netip.ParsePrefix(s)
		if err != nil {
			r.errs = append(r.errs, fmt.Errorf("%s: %q is not a CIDR", key, s))
			continue
		}
		out = append(out, p)
	}
	return out
}

// parseDuration is time.ParseDuration plus a whole-day suffix ("30d"), the
// form used by REMEMBER_TTL.
func parseDuration(v string) (time.Duration, error) {
	if n, ok := strings.CutSuffix(v, "d"); ok {
		days, err := strconv.Atoi(n)
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(v)
}

// origins reads a comma-separated list of full origins and drops any
// trailing slash. An unset variable falls back to def.
func (r *reader) origins(key, def string) []string {
	var out []string
	for _, s := range strings.Split(r.str(key, def), ",") {
		s = strings.TrimRight(strings.TrimSpace(s), "/")
		if s == "" {
			continue
		}
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.Path != "" {
			r.errs = append(r.errs, fmt.Errorf("%s: %q is not an origin such as https://example.com", key, s))
			continue
		}
		out = append(out, s)
	}
	return out
}
