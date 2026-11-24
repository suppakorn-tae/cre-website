package queue_test

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
)

func startValkey(t *testing.T) string {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "valkey/valkey:8-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor:   wait.ForLog("Ready to accept connections").WithStartupTimeout(time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start valkey: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	ep, err := ctr.PortEndpoint(ctx, "6379/tcp", "redis")
	if err != nil {
		t.Fatal(err)
	}
	return ep
}

func TestEnqueueAndProcess(t *testing.T) {
	url := startValkey(t)

	type job struct{ kind, payload string }
	got := make(chan job, 2)

	srv, err := queue.NewServer(queue.ServerConfig{RedisURL: url, Concurrency: queue.DefaultConcurrency()})
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"report:pdf", "export:xlsx"} {
		srv.Handle(kind, func(_ context.Context, k string, p []byte) error {
			got <- job{k, string(p)}
			return nil
		})
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	defer srv.Stop()

	c, err := queue.NewClient(url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	ctx := context.Background()
	if err := c.Enqueue(ctx, "report:pdf", []byte("r1"), queue.Reports); err != nil {
		t.Fatal(err)
	}
	if err := c.Enqueue(ctx, "export:xlsx", []byte("e1"), queue.Exports); err != nil {
		t.Fatal(err)
	}

	seen := map[string]string{}
	deadline := time.After(20 * time.Second)
	for len(seen) < 2 {
		select {
		case j := <-got:
			seen[j.kind] = j.payload
		case <-deadline:
			t.Fatalf("timeout, saw %v", seen)
		}
	}
	if seen["report:pdf"] != "r1" || seen["export:xlsx"] != "e1" {
		t.Fatalf("payloads: %v", seen)
	}
}
