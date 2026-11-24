// Package log builds the JSON slog logger that tags records with the request id.
package log

import (
	"context"
	"io"
	"log/slog"
)

type ctxKey struct{}

// WithRequestID returns ctx carrying the request id.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestID returns the request id in ctx, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

type handler struct{ slog.Handler }

func (h handler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h handler) WithAttrs(a []slog.Attr) slog.Handler { return handler{h.Handler.WithAttrs(a)} }
func (h handler) WithGroup(n string) slog.Handler      { return handler{h.Handler.WithGroup(n)} }

// New returns a JSON logger writing to w. level is debug, info, warn or error.
func New(w io.Writer, level string) *slog.Logger {
	var l slog.Level
	if err := l.UnmarshalText([]byte(level)); err != nil {
		l = slog.LevelInfo
	}
	return slog.New(handler{slog.NewJSONHandler(w, &slog.HandlerOptions{Level: l})})
}
