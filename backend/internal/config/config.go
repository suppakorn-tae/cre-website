// Package config reads typed configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/netip"
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
}

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
	}
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
	d, err := time.ParseDuration(v)
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
