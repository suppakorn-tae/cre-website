// Package httpserver runs an http.Server until its context ends, then drains it.
package httpserver

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"
)

// Serve serves srv on ln until ctx is cancelled (e.g. SIGTERM). It then calls
// onDrain (optional, e.g. to fail /readyz) and lets in-flight requests finish
// for at most drain before closing connections.
func Serve(ctx context.Context, srv *http.Server, ln net.Listener, drain time.Duration, log *slog.Logger, onDrain func()) error {
	errc := make(chan error, 1)
	go func() {
		log.Info("http server listening", "addr", ln.Addr().String())
		errc <- srv.Serve(ln)
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	if onDrain != nil {
		onDrain()
	}
	log.Info("shutdown started", "drain", drain.String())
	sctx, cancel := context.WithTimeout(context.Background(), drain)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		_ = srv.Close()
		return err
	}
	if err := <-errc; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Info("shutdown complete")
	return nil
}

// ListenAndServe binds srv.Addr and calls Serve.
func ListenAndServe(ctx context.Context, srv *http.Server, drain time.Duration, log *slog.Logger, onDrain func()) error {
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return err
	}
	return Serve(ctx, srv, ln, drain, log, onDrain)
}
