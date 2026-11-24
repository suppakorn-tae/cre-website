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
	c, err := LoadAPI(env(map[string]string{"DATABASE_URL": "postgres://x", "VALKEY_ADDR": "valkey:6379", "APP_ENV": "development"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.HTTPAddr != ":4000" || c.ShutdownTimeout != 25*time.Second || c.RequestTimeout != 30*time.Second || c.LogLevel != "info" {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if len(c.TrustedProxies) != 0 {
		t.Fatalf("no proxy may be trusted by default: %v", c.TrustedProxies)
	}
}

func TestLoadAPITrustedProxies(t *testing.T) {
	c, err := LoadAPI(env(map[string]string{
		"DATABASE_URL": "p", "VALKEY_ADDR": "v", "TRUSTED_PROXIES": "10.1.0.0/16, 192.168.5.7/32", "APP_ENV": "development",
	}))
	if err != nil || len(c.TrustedProxies) != 2 {
		t.Fatalf("got %v %v", c.TrustedProxies, err)
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

func apiEnv(extra map[string]string) Getenv {
	m := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v:1"}
	for k, v := range extra {
		m[k] = v
	}
	return env(m)
}

func TestLoadAPIRefusesProductionWithoutSessionSecret(t *testing.T) {
	for _, e := range []map[string]string{
		{},                        // production is the default
		{"APP_ENV": "production"}, // explicit
		{"APP_ENV": "production", "SESSION_SECRET": "too-short"},
	} {
		_, err := LoadAPI(apiEnv(e))
		if err == nil || !strings.Contains(err.Error(), "SESSION_SECRET") {
			t.Fatalf("env %v: want SESSION_SECRET error, got %v", e, err)
		}
	}
}

func TestLoadAPISession(t *testing.T) {
	secret := strings.Repeat("s", 32)
	c, err := LoadAPI(apiEnv(map[string]string{
		"SESSION_SECRET": secret, "SESSION_TTL": "2h", "REMEMBER_TTL": "30d",
		"ALLOWED_ORIGINS": "https://a.example.com, http://b.example.com/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.SessionSecret != secret || c.SessionTTL != 2*time.Hour || c.RememberTTL != 30*24*time.Hour {
		t.Fatalf("session: %+v", c)
	}
	if len(c.AllowedOrigins) != 2 || c.AllowedOrigins[1] != "http://b.example.com" {
		t.Fatalf("origins: %v", c.AllowedOrigins)
	}
	if c.Insecure() {
		t.Fatal("production cookies must be Secure")
	}
}

func TestLoadAPISessionDefaultsAndDevelopment(t *testing.T) {
	c, err := LoadAPI(apiEnv(map[string]string{"APP_ENV": "development", "PUBLIC_BASE_URL": "http://localhost:3000"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.SessionTTL != 12*time.Hour || c.RememberTTL != 30*24*time.Hour || !c.Insecure() {
		t.Fatalf("defaults: %+v", c)
	}
	if len(c.AllowedOrigins) != 1 || c.AllowedOrigins[0] != "http://localhost:3000" {
		t.Fatalf("origins default to PUBLIC_BASE_URL: %v", c.AllowedOrigins)
	}
}

func TestLoadAPIRejectsBadSessionConfig(t *testing.T) {
	_, err := LoadAPI(apiEnv(map[string]string{
		"APP_ENV": "staging", "REMEMBER_TTL": "forever", "ALLOWED_ORIGINS": "not-an-origin",
	}))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, want := range []string{"APP_ENV", "REMEMBER_TTL", "ALLOWED_ORIGINS"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %s: %v", want, err)
		}
	}
}
