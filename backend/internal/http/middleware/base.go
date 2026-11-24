package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"runtime/debug"
	"strings"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
)

// RequestIDHeader carries the request id in and out.
const RequestIDHeader = "X-Request-Id"

// RequestID assigns a fresh id to every request and echoes it in the response.
// Client-supplied ids are ignored so logs cannot be forged.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b [8]byte
		_, _ = rand.Read(b[:])
		id := hex.EncodeToString(b[:])
		w.Header().Set(RequestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(log.WithRequestID(r.Context(), id)))
	})
}

type clientIPKey struct{}

// ClientIP returns the client address resolved by RealIP, or "".
func ClientIP(ctx context.Context) string {
	s, _ := ctx.Value(clientIPKey{}).(string)
	return s
}

// RealIP resolves the client address. X-Forwarded-For is believed only when
// the direct peer is inside trusted (Caddy); entries are read right to left
// and the first one outside trusted is the client. Otherwise the peer is used.
func RealIP(trusted []netip.Prefix) func(http.Handler) http.Handler {
	isTrusted := func(a netip.Addr) bool { return inPrefixes(a, trusted) }
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			host, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				host = r.RemoteAddr
			}
			ip := host
			if peer, err := netip.ParseAddr(host); err == nil && isTrusted(peer) {
				parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
				for i := len(parts) - 1; i >= 0; i-- {
					a, err := netip.ParseAddr(strings.TrimSpace(parts[i]))
					if err != nil {
						break
					}
					ip = a.String()
					if !isTrusted(a) {
						break
					}
				}
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clientIPKey{}, ip)))
		})
	}
}

// inPrefixes reports whether a is inside one of the trusted prefixes.
func inPrefixes(a netip.Addr, trusted []netip.Prefix) bool {
	for _, p := range trusted {
		if p.Contains(a.Unmap()) {
			return true
		}
	}
	return false
}

// TrustedPeer reports whether the direct TCP peer of r (the proxy that
// connects to us) is inside one of the trusted networks.
func TrustedPeer(r *http.Request, trusted []netip.Prefix) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	return inPrefixes(peer, trusted)
}

type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *statusWriter) WriteHeader(c int) {
	if !w.wrote {
		w.status, w.wrote = c, true
	}
	w.ResponseWriter.WriteHeader(c)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	w.wrote = true
	return w.ResponseWriter.Write(b)
}

// Logger writes one structured line per request.
func Logger(l *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)
			l.LogAttrs(r.Context(), slog.LevelInfo, "request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", sw.status),
				slog.Duration("duration", time.Since(start)),
				slog.String("client_ip", ClientIP(r.Context())),
			)
		})
	}
}

// Recoverer turns a panic into a 500 error envelope and logs the stack.
func Recoverer(l *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil || rec == http.ErrAbortHandler {
					if rec != nil {
						panic(rec)
					}
					return
				}
				l.ErrorContext(r.Context(), "panic recovered", "panic", rec, "stack", string(debug.Stack()))
				WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal server error")
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// Timeout cancels the request context after d. Handlers must honour the
// context; a handler that finishes with the deadline exceeded and wrote
// nothing gets a 504 envelope.
func Timeout(d time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d)
			defer cancel()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r.WithContext(ctx))
			if ctx.Err() == context.DeadlineExceeded && !sw.wrote {
				WriteError(w, r, http.StatusGatewayTimeout, "timeout", "Request timed out")
			}
		})
	}
}
