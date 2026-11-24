package log

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
)

func TestRequestIDInRecord(t *testing.T) {
	var b bytes.Buffer
	l := New(&b, "info")
	l.InfoContext(WithRequestID(context.Background(), "abc"), "hello")
	var m map[string]any
	if err := json.Unmarshal(b.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m["request_id"] != "abc" || m["msg"] != "hello" {
		t.Fatalf("got %v", m)
	}
}

func TestLevelFilters(t *testing.T) {
	var b bytes.Buffer
	New(&b, "error").Info("x")
	if b.Len() != 0 {
		t.Fatal("info should be filtered")
	}
}
