package valkey_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// The TTL guard runs before any network call, so an unreachable address is fine.
func TestWritesRejectNonPositiveTTL(t *testing.T) {
	c, err := valkey.New("redis://127.0.0.1:1/0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	ctx := context.Background()

	for _, ttl := range []time.Duration{0, -time.Second} {
		if err := c.Set(ctx, "k", []byte("v"), ttl); !errors.Is(err, valkey.ErrInvalidTTL) {
			t.Errorf("Set ttl=%v: got %v", ttl, err)
		}
		if _, err := c.Incr(ctx, "k", ttl); !errors.Is(err, valkey.ErrInvalidTTL) {
			t.Errorf("Incr ttl=%v: got %v", ttl, err)
		}
		if _, err := c.SetNX(ctx, "k", []byte("v"), ttl); !errors.Is(err, valkey.ErrInvalidTTL) {
			t.Errorf("SetNX ttl=%v: got %v", ttl, err)
		}
	}
}

func TestNewRejectsBadURL(t *testing.T) {
	if _, err := valkey.New("://nope"); err == nil {
		t.Fatal("want error")
	}
}

func TestCheckFailsWhenUnreachable(t *testing.T) {
	c, err := valkey.New("redis://127.0.0.1:1/0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := c.Check(ctx); err == nil {
		t.Fatal("want error")
	}
}
