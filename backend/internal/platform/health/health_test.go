package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func get(h http.Handler) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	return rec
}

func TestReadyzOK(t *testing.T) {
	c := New(time.Second)
	c.Add("db", func(context.Context) error { return nil })
	if rec := get(c.Readyz()); rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestReadyzFailsWhenCheckFails(t *testing.T) {
	c := New(time.Second)
	c.Add("db", func(context.Context) error { return nil })
	c.Add("valkey", func(context.Context) error { return errors.New("down: secret-host") })
	rec := get(c.Readyz())
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"valkey":"failed"`) || !strings.Contains(body, `"db":"ok"`) {
		t.Fatalf("body %s", body)
	}
	if strings.Contains(body, "secret-host") {
		t.Fatal("error details leaked")
	}
}

func TestReadyzFailsWhenDraining(t *testing.T) {
	c := New(time.Second)
	c.Add("db", func(context.Context) error { return nil })
	c.SetDraining()
	if rec := get(c.Readyz()); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", rec.Code)
	}
	if rec := get(c.Healthz()); rec.Code != http.StatusOK {
		t.Fatalf("liveness must stay up while draining: %d", rec.Code)
	}
}

func TestReadyzTimeout(t *testing.T) {
	c := New(10 * time.Millisecond)
	c.Add("slow", func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() })
	if rec := get(c.Readyz()); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestHealthzIgnoresChecks(t *testing.T) {
	c := New(time.Second)
	c.Add("db", func(context.Context) error { return errors.New("x") })
	if rec := get(c.Healthz()); rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
}
