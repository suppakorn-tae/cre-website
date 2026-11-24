package httpserver

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"testing"
	"time"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func start(t *testing.T, h http.HandlerFunc, drain time.Duration) (url string, cancel context.CancelFunc, done chan error) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done = make(chan error, 1)
	go func() { done <- Serve(ctx, &http.Server{Handler: h}, ln, drain, quiet) }()
	return "http://" + ln.Addr().String() + "/", cancel, done
}

func TestShutdownDrainsInFlight(t *testing.T) {
	started := make(chan struct{})
	url, cancel, done := start(t, func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		time.Sleep(300 * time.Millisecond)
		_, _ = w.Write([]byte("done"))
	}, 5*time.Second)

	body := make(chan string, 1)
	go func() {
		resp, err := http.Get(url)
		if err != nil {
			body <- err.Error()
			return
		}
		defer func() { _ = resp.Body.Close() }()
		b, _ := io.ReadAll(resp.Body)
		body <- string(b)
	}()
	<-started
	cancel() // SIGTERM while the request is in flight

	if got := <-body; got != "done" {
		t.Fatalf("in-flight request not drained: %q", got)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestShutdownTimeoutForcesClose(t *testing.T) {
	started := make(chan struct{})
	url, cancel, done := start(t, func(http.ResponseWriter, *http.Request) {
		close(started)
		time.Sleep(2 * time.Second)
	}, 100*time.Millisecond)

	go func() {
		if resp, err := http.Get(url); err == nil {
			_ = resp.Body.Close()
		}
	}()
	<-started
	cancel()
	if err := <-done; err == nil {
		t.Fatal("expected deadline error when drain exceeds timeout")
	}
}
