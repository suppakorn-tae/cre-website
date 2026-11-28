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
		"SMTP_HOST":       "smtp.example.com", "SMTP_FROM": "no-reply@example.com",
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

func TestLoadAPISMTP(t *testing.T) {
	c, err := LoadAPI(apiEnv(map[string]string{
		"APP_ENV": "development", "SMTP_HOST": "mailpit", "SMTP_PORT": "1025", "SMTP_FROM": "no-reply@localhost",
		"SMTP_USER": "u", "SMTP_PASSWORD": "p", "SMTP_REQUIRE_TLS": "true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.SMTPHost != "mailpit" || c.SMTPPort != 1025 || c.SMTPFrom != "no-reply@localhost" ||
		c.SMTPUser != "u" || c.SMTPPassword != "p" || !c.SMTPRequireTLS {
		t.Fatalf("smtp: %+v", c)
	}
	c, err = LoadAPI(apiEnv(map[string]string{"APP_ENV": "development"}))
	if err != nil || c.SMTPHost != "" || c.SMTPPort != 587 || c.SMTPRequireTLS {
		t.Fatalf("development without smtp: %+v %v", c, err)
	}
}

func TestLoadAPISMTPProblems(t *testing.T) {
	cases := map[string]map[string]string{
		"SMTP_HOST is required in production": {"SESSION_SECRET": strings.Repeat("s", 32)},
		"SMTP_FROM is required":               {"APP_ENV": "development", "SMTP_HOST": "m"},
		"SMTP_PORT":                           {"APP_ENV": "development", "SMTP_PORT": "x"},
		"SMTP_REQUIRE_TLS":                    {"APP_ENV": "development", "SMTP_REQUIRE_TLS": "maybe"},
	}
	for want, e := range cases {
		if _, err := LoadAPI(apiEnv(e)); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want %q, got %v", want, err)
		}
	}
}

func TestLoadWorkerJobLimits(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v"}
	c, err := LoadWorker(env(base))
	if err != nil || c.ExportTimeout != 25*time.Minute || c.ReportTimeout != 5*time.Minute ||
		c.StuckMargin != 10*time.Minute || c.QueuedMaxAge != 6*time.Hour {
		t.Fatalf("defaults: %+v %v", c, err)
	}
	base["EXPORT_TIMEOUT"] = "20m"
	base["JOB_QUEUED_MAX_AGE"] = "bad"
	c, err = LoadWorker(env(base))
	if c.ExportTimeout != 20*time.Minute || err == nil || !strings.Contains(err.Error(), "JOB_QUEUED_MAX_AGE") {
		t.Fatalf("override: %+v %v", c, err)
	}
}

func TestLoadWorkerRejectsTimeoutOverTaskLimit(t *testing.T) {
	for _, key := range []string{"EXPORT_TIMEOUT", "REPORT_TIMEOUT"} {
		for _, v := range []string{"30m", "45m", "1h"} {
			e := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v", key: v}
			if _, err := LoadWorker(env(e)); err == nil || !strings.Contains(err.Error(), key) {
				t.Errorf("%s=%s: want error naming the key, got %v", key, v, err)
			}
		}
		e := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v", key: "29m"}
		if _, err := LoadWorker(env(e)); err != nil {
			t.Errorf("%s=29m: %v", key, err)
		}
	}
}

func TestLoadAPISMTPRequireTLSDefault(t *testing.T) {
	prod := map[string]string{
		"SESSION_SECRET": strings.Repeat("s", 32), "SMTP_HOST": "relay", "SMTP_FROM": "a@example.com",
	}
	cases := []struct {
		name string
		env  map[string]string
		want bool
	}{
		{"production unset", map[string]string{}, true},
		{"production empty", map[string]string{"SMTP_REQUIRE_TLS": ""}, true},
		{"production explicit false", map[string]string{"SMTP_REQUIRE_TLS": "false"}, false},
		{"production explicit true", map[string]string{"SMTP_REQUIRE_TLS": "true"}, true},
		{"development unset", map[string]string{"APP_ENV": "development"}, false},
		{"development explicit true", map[string]string{"APP_ENV": "development", "SMTP_REQUIRE_TLS": "true"}, true},
	}
	for _, tc := range cases {
		env := map[string]string{}
		for k, v := range prod {
			env[k] = v
		}
		for k, v := range tc.env {
			env[k] = v
		}
		c, err := LoadAPI(apiEnv(env))
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if c.SMTPRequireTLS != tc.want {
			t.Errorf("%s: SMTPRequireTLS = %v, want %v", tc.name, c.SMTPRequireTLS, tc.want)
		}
	}
}

func TestLoadAPILimits(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v", "APP_ENV": "development"}
	c, err := LoadAPI(env(base))
	if err != nil || c.MaxProjectsPerUser != 3 || c.MaxVersionsPerProject != 10 {
		t.Fatalf("defaults: %d %d %v, want 3 10", c.MaxProjectsPerUser, c.MaxVersionsPerProject, err)
	}
	base["MAX_PROJECTS_PER_USER"], base["MAX_VERSIONS_PER_PROJECT"] = "5", "20"
	c, err = LoadAPI(env(base))
	if err != nil || c.MaxProjectsPerUser != 5 || c.MaxVersionsPerProject != 20 {
		t.Fatalf("set: %d %d %v, want 5 20", c.MaxProjectsPerUser, c.MaxVersionsPerProject, err)
	}
	base["MAX_PROJECTS_PER_USER"], base["MAX_VERSIONS_PER_PROJECT"] = "", "  "
	c, err = LoadAPI(env(base))
	if err != nil || c.MaxProjectsPerUser != 3 || c.MaxVersionsPerProject != 10 {
		t.Fatalf("empty: %d %d %v, want the defaults", c.MaxProjectsPerUser, c.MaxVersionsPerProject, err)
	}
}

func TestLoadAPIRejectsBadLimits(t *testing.T) {
	for _, bad := range []string{"0", "-1", "abc", "2.5"} {
		for _, key := range []string{"MAX_PROJECTS_PER_USER", "MAX_VERSIONS_PER_PROJECT"} {
			_, err := LoadAPI(env(map[string]string{
				"DATABASE_URL": "p", "VALKEY_ADDR": "v", "APP_ENV": "development", key: bad,
			}))
			if err == nil || !strings.Contains(err.Error(), key) {
				t.Errorf("%s=%q: want an error naming the key, got %v", key, bad, err)
			}
		}
	}
}

func TestRequireAppRole(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "p", "VALKEY_ADDR": "v", "APP_ENV": "development"}
	for _, tc := range []struct {
		val     string
		set     bool
		want    bool
		wantErr bool
	}{{"", false, false, false}, {"", true, false, false}, {"true", true, true, false}, {"false", true, false, false}, {"yes please", true, false, true}} {
		m := map[string]string{}
		for k, v := range base {
			m[k] = v
		}
		if tc.set {
			m["DB_REQUIRE_APP_ROLE"] = tc.val
		}
		a, errA := LoadAPI(env(m))
		w, errW := LoadWorker(env(m))
		if (errA != nil) != tc.wantErr || (errW != nil) != tc.wantErr {
			t.Fatalf("%q: errors api=%v worker=%v", tc.val, errA, errW)
		}
		if !tc.wantErr && (a.RequireAppRole != tc.want || w.RequireAppRole != tc.want) {
			t.Errorf("%q: api=%t worker=%t, want %t", tc.val, a.RequireAppRole, w.RequireAppRole, tc.want)
		}
	}
}
