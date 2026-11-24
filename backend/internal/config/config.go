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
}

// MinSessionSecret is the shortest accepted SESSION_SECRET in bytes.
const MinSessionSecret = 32

// Insecure reports local http development: cookies drop the Secure flag.
func (c API) Insecure() bool { return c.Env != "production" }

// Worker is the worker process configuration.
type Worker struct {
	Common
	// HTTPAddr serves /healthz, /readyz and /metrics.
	HTTPAddr string
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
	return c, r.err()
}

// LoadWorker reads the worker configuration and reports every problem at once.
func LoadWorker(get Getenv) (Worker, error) {
	r := reader{get: get}
	c := Worker{
		Common:   r.common(),
		HTTPAddr: r.str("HTTP_ADDR", ":4001"),
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
