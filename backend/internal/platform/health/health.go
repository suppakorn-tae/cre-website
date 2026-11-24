// Package health serves liveness and readiness probes with pluggable checks.
package health

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Check returns nil when its dependency is ready.
type Check func(ctx context.Context) error

// Checker holds named readiness checks.
type Checker struct {
	mu      sync.RWMutex
	checks  map[string]Check
	timeout time.Duration

	draining atomic.Bool
}

// New returns a Checker; each check gets timeout to answer.
func New(timeout time.Duration) *Checker {
	return &Checker{checks: map[string]Check{}, timeout: timeout}
}

// SetDraining makes /readyz fail from now on. Call it when SIGTERM arrives so
// the load balancer stops sending traffic while in-flight requests finish.
func (c *Checker) SetDraining() { c.draining.Store(true) }

// Add registers a check under name, replacing any earlier one.
func (c *Checker) Add(name string, fn Check) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.checks[name] = fn
}

// Healthz is the liveness probe: the process is up. It checks no dependency.
func (c *Checker) Healthz() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		write(w, http.StatusOK, map[string]any{"status": "ok"})
	})
}

// Readyz is the readiness probe: 503 when any check fails or times out.
// Failure details stay in the logs of the check, not in the response.
func (c *Checker) Readyz() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c.draining.Load() {
			write(w, http.StatusServiceUnavailable, map[string]any{"status": "draining"})
			return
		}
		c.mu.RLock()
		names := make([]string, 0, len(c.checks))
		for n := range c.checks {
			names = append(names, n)
		}
		sort.Strings(names)
		fns := make([]Check, len(names))
		for i, n := range names {
			fns[i] = c.checks[n]
		}
		c.mu.RUnlock()

		ctx, cancel := context.WithTimeout(r.Context(), c.timeout)
		defer cancel()
		ok := make([]bool, len(names))
		var wg sync.WaitGroup
		for i := range fns {
			wg.Add(1)
			go func() {
				defer wg.Done()
				ok[i] = fns[i](ctx) == nil
			}()
		}
		wg.Wait()

		checks := map[string]string{}
		code, status := http.StatusOK, "ok"
		for i, n := range names {
			checks[n] = "ok"
			if !ok[i] {
				checks[n] = "failed"
				code, status = http.StatusServiceUnavailable, "unavailable"
			}
		}
		write(w, code, map[string]any{"status": status, "checks": checks})
	})
}

func write(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}
