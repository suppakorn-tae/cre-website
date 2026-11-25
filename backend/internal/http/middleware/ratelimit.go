package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// RateLimitedCode is the ErrorBody.code of a 429 from RateLimit.
const RateLimitedCode = "rate_limited"

// maxKeyBody caps how much of a request body KeyEmail reads.
const maxKeyBody = 64 << 10

// KeyFunc derives the counted key from a request. An empty key means the
// request cannot be attributed (for example no e-mail in the body) and is not
// counted by this limiter.
type KeyFunc func(r *http.Request) string

// RateLimit counts requests per key in a fixed window shared through store,
// so every api replica sees one counter. The window starts at the first
// request for a key. Once a key passes limit requests in its window, further
// requests get 429 rate_limited with Retry-After (seconds).
//
// name separates limiters: the Valkey key is "rl:<name>:<key>". If Valkey
// fails the request is let through (fail open) and the error is logged, so a
// Valkey outage does not lock every user out.
func RateLimit(store valkey.StateStore, name string, limit int, window time.Duration, keyFn KeyFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			k := keyFn(r)
			if k == "" {
				next.ServeHTTP(w, r)
				return
			}
			n, err := store.Incr(r.Context(), "rl:"+name+":"+k, window)
			if err != nil {
				slog.ErrorContext(r.Context(), "rate limit store failed", "limiter", name, "error", err)
				next.ServeHTTP(w, r)
				return
			}
			if n > int64(limit) {
				// Incr exposes no remaining TTL, so the whole window is a
				// safe upper bound for the wait.
				w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(window.Seconds()))))
				WriteError(w, r, http.StatusTooManyRequests, RateLimitedCode, "too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// KeyIP keys by the client address that RealIP resolved.
func KeyIP(r *http.Request) string { return ClientIP(r.Context()) }

// KeyEmail keys by the lower-cased, trimmed "email" field of a JSON body. The
// body is restored for the next handler. It returns "" for a missing or
// unreadable e-mail, leaving that request to the per-IP limiter.
func KeyEmail(r *http.Request) string {
	if r.Body == nil {
		return ""
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxKeyBody+1))
	rest := r.Body
	r.Body = struct {
		io.Reader
		io.Closer
	}{io.MultiReader(bytes.NewReader(raw), rest), rest}
	if err != nil || len(raw) > maxKeyBody {
		return ""
	}
	var b struct {
		Email string `json:"email"`
	}
	if json.Unmarshal(raw, &b) != nil || !utf8.ValidString(b.Email) {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(b.Email))
}

// LimitFromEnv reads <prefix>_LIMIT (requests) and <prefix>_WINDOW (a Go
// duration such as "15m", or whole days such as "1d") from the environment, using the defaults when a
// variable is unset or invalid.
func LimitFromEnv(prefix string, defLimit int, defWindow time.Duration) (int, time.Duration) {
	limit, window := defLimit, defWindow
	if n, err := strconv.Atoi(os.Getenv(prefix + "_LIMIT")); err == nil && n > 0 {
		limit = n
	}
	if d, err := parseWindow(os.Getenv(prefix + "_WINDOW")); err == nil && d > 0 {
		window = d
	}
	return limit, window
}

// parseWindow is time.ParseDuration plus a whole-day suffix ("1d"), the form
// used by REMEMBER_TTL.
func parseWindow(v string) (time.Duration, error) {
	if n, ok := strings.CutSuffix(v, "d"); ok {
		days, err := strconv.Atoi(n)
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(v)
}
