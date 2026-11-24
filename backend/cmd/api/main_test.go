package main

import "testing"

func TestValkeyURL(t *testing.T) {
	for in, want := range map[string]string{
		"valkey:6379":              "redis://valkey:6379",
		"redis://valkey:6379/1":    "redis://valkey:6379/1",
		"rediss://u:p@host:6380/0": "rediss://u:p@host:6380/0",
	} {
		if got := valkeyURL(in); got != want {
			t.Errorf("valkeyURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValkeyHostPort(t *testing.T) {
	for in, want := range map[string]string{
		"valkey:6379":              "valkey:6379",
		"redis://valkey:6379/1":    "valkey:6379",
		"rediss://u:p@host:6380/0": "host:6380",
	} {
		if got := valkeyHostPort(in); got != want {
			t.Errorf("valkeyHostPort(%q) = %q, want %q", in, got, want)
		}
	}
}
