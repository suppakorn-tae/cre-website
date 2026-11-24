package valkey_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

func startValkey(t *testing.T) *valkey.Client {
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
	c, err := valkey.New(ep)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func TestStateStore(t *testing.T) {
	c := startValkey(t)
	ctx := context.Background()

	if err := c.Check(ctx); err != nil {
		t.Fatalf("check: %v", err)
	}
	if _, err := c.Get(ctx, "missing"); !errors.Is(err, valkey.ErrNotFound) {
		t.Fatalf("get missing: %v", err)
	}

	if err := c.Set(ctx, "a", []byte("1"), time.Minute); err != nil {
		t.Fatal(err)
	}
	if v, err := c.Get(ctx, "a"); err != nil || string(v) != "1" {
		t.Fatalf("get: %q %v", v, err)
	}
	if err := c.Del(ctx, "a", "nope"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Get(ctx, "a"); !errors.Is(err, valkey.ErrNotFound) {
		t.Fatalf("after del: %v", err)
	}

	if err := c.Set(ctx, "short", []byte("x"), 200*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(400 * time.Millisecond)
	if _, err := c.Get(ctx, "short"); !errors.Is(err, valkey.ErrNotFound) {
		t.Fatalf("expired key still present: %v", err)
	}

	ok, err := c.SetNX(ctx, "lock", []byte("me"), time.Minute)
	if err != nil || !ok {
		t.Fatalf("setnx first: %v %v", ok, err)
	}
	ok, err = c.SetNX(ctx, "lock", []byte("you"), time.Minute)
	if err != nil || ok {
		t.Fatalf("setnx second: %v %v", ok, err)
	}
}

func TestIncrSetsTTLOnce(t *testing.T) {
	c := startValkey(t)
	ctx := context.Background()

	for want := int64(1); want <= 3; want++ {
		got, err := c.Incr(ctx, "n", time.Second)
		if err != nil || got != want {
			t.Fatalf("incr: %d %v, want %d", got, err, want)
		}
	}
	time.Sleep(1500 * time.Millisecond)
	got, err := c.Incr(ctx, "n", time.Minute)
	if err != nil || got != 1 {
		t.Fatalf("counter did not expire: %d %v", got, err)
	}
}

func TestPubSub(t *testing.T) {
	c := startValkey(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	msgs, stop, err := c.Subscribe(ctx, "inv")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = stop() }()

	if err := c.Publish(ctx, "inv", []byte("catalogue")); err != nil {
		t.Fatal(err)
	}
	select {
	case m := <-msgs:
		if m.Channel != "inv" || string(m.Payload) != "catalogue" {
			t.Fatalf("got %+v", m)
		}
	case <-ctx.Done():
		t.Fatal("no message")
	}
}
