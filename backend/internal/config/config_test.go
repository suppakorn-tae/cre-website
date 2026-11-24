package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) Getenv {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestLoadAPIDefaults(t *testing.T) {
	c, err := LoadAPI(env(map[string]string{"DATABASE_URL": "postgres://x", "VALKEY_ADDR": "valkey:6379"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.HTTPAddr != ":4000" || c.ShutdownTimeout != 25*time.Second || c.RequestTimeout != 30*time.Second || c.LogLevel != "info" {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if len(c.TrustedProxies) == 0 {
		t.Fatal("expected default trusted proxies")
	}
}

func TestLoadAPIMissingDatabaseURL(t *testing.T) {
	_, err := LoadAPI(env(map[string]string{"VALKEY_ADDR": "v:1"}))
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is required") {
		t.Fatalf("want DATABASE_URL error, got %v", err)
	}
}

func TestLoadReportsAllProblems(t *testing.T) {
	_, err := LoadAPI(env(map[string]string{
		"SHUTDOWN_TIMEOUT": "soon", "LOG_LEVEL": "loud", "TRUSTED_PROXIES": "nope",
	}))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, want := range []string{"DATABASE_URL", "VALKEY_ADDR", "SHUTDOWN_TIMEOUT", "LOG_LEVEL", "TRUSTED_PROXIES"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %s: %v", want, err)
		}
	}
}

func TestLoadWorker(t *testing.T) {
	c, err := LoadWorker(env(map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v", "HTTP_ADDR": ":9"}))
	if err != nil || c.HTTPAddr != ":9" {
		t.Fatalf("got %+v %v", c, err)
	}
}
