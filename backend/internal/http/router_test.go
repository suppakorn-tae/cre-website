package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/config"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/health"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/metrics"
)

func newDeps(buf *bytes.Buffer) (Deps, *health.Checker) {
	h := health.New(time.Second)
	return Deps{
		Deps: app.Deps{
			Config: config.API{
				TrustedProxies: []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")},
				RequestTimeout: time.Second,
			},
			Logger:       log.New(buf, "info"),
			Auth:         app.PassThrough,
			RequireAdmin: app.PassThrough,
			CSRF:         app.PassThrough,
		},
		Metrics: metrics.New(),
		Health:  h,
	}, h
}

func do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, nil)
	req.RemoteAddr = "10.0.0.5:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	h.ServeHTTP(rec, req)
	return rec
}

func TestReadyzFailsWhenCheckFails(t *testing.T) {
	var buf bytes.Buffer
	d, h := newDeps(&buf)
	r := NewRouter(d)

	h.Add("db", func(context.Context) error { return nil })
	if rec := do(r, "GET", "/readyz"); rec.Code != http.StatusOK {
		t.Fatalf("ready: %d", rec.Code)
	}
	h.Add("valkey", func(context.Context) error { return errors.New("down") })
	if rec := do(r, "GET", "/readyz"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("not ready: %d", rec.Code)
	}
	if rec := do(r, "GET", "/healthz"); rec.Code != http.StatusOK {
		t.Fatalf("healthz: %d", rec.Code)
	}
}

func TestMetricsServed(t *testing.T) {
	var buf bytes.Buffer
	d, _ := newDeps(&buf)
	r := NewRouter(d)
	do(r, "GET", "/healthz")
	rec := do(r, "GET", "/metrics")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "http_requests_total") {
		t.Fatalf("metrics: %d %s", rec.Code, rec.Body)
	}
}

func TestNotFoundUsesEnvelopeWithRequestID(t *testing.T) {
	var buf bytes.Buffer
	d, _ := newDeps(&buf)
	rec := do(NewRouter(d), "GET", "/api/v1/nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d", rec.Code)
	}
	var body struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "not_found" || body.Error.RequestID == "" || body.Error.RequestID != rec.Header().Get("X-Request-Id") {
		t.Fatalf("envelope: %+v", body)
	}
}

func TestRequestLogCarriesRequestIDAndRealIP(t *testing.T) {
	var buf bytes.Buffer
	d, _ := newDeps(&buf)
	do(NewRouter(d), "GET", "/healthz")
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("%v: %s", err, buf.String())
	}
	if line["request_id"] == nil || line["client_ip"] != "203.0.113.9" || line["status"] != float64(200) {
		t.Fatalf("log line: %v", line)
	}
}

func TestRealIPIgnoresHeaderFromUntrustedPeer(t *testing.T) {
	var buf bytes.Buffer
	d, _ := newDeps(&buf)
	req := httptest.NewRequest("GET", "/healthz", nil)
	req.RemoteAddr = "198.51.100.1:99"
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	NewRouter(d).ServeHTTP(httptest.NewRecorder(), req)
	if !strings.Contains(buf.String(), `"client_ip":"198.51.100.1"`) {
		t.Fatalf("spoofed header trusted: %s", buf.String())
	}
}
