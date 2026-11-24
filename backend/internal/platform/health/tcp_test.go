package health

import (
	"context"
	"net"
	"testing"
	"time"
)

func TestTCP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := TCP(ln.Addr().String())(ctx); err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	if err := TCP(addr)(ctx); err == nil {
		t.Fatal("expected failure on closed port")
	}
}

func TestHostPortFromURL(t *testing.T) {
	got, err := HostPortFromURL("postgres://u:p@db/cre?sslmode=disable", "5432")
	if err != nil || got != "db:5432" {
		t.Fatalf("got %q %v", got, err)
	}
	if _, err := HostPortFromURL("::bad", "1"); err == nil {
		t.Fatal("expected error")
	}
}
