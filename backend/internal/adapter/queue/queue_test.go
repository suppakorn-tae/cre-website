package queue_test

import (
	"context"
	"errors"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
)

func TestEnqueueValidation(t *testing.T) {
	c, err := queue.NewClient("redis://127.0.0.1:1/0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	if err := c.Enqueue(context.Background(), "report:pdf", nil, "other"); !errors.Is(err, queue.ErrUnknownQueue) {
		t.Fatalf("got %v", err)
	}
	if err := c.Enqueue(context.Background(), "", nil, queue.Reports); err == nil {
		t.Fatal("want error for empty kind")
	}
}

func TestNewServerValidation(t *testing.T) {
	url := "redis://127.0.0.1:1/0"
	cases := map[string]queue.ServerConfig{
		"no queues": {RedisURL: url},
		"zero":      {RedisURL: url, Concurrency: map[string]int{queue.Reports: 0}},
		"unknown":   {RedisURL: url, Concurrency: map[string]int{"x": 1}},
		"bad url":   {RedisURL: "://", Concurrency: queue.DefaultConcurrency()},
	}
	for name, cfg := range cases {
		if _, err := queue.NewServer(cfg); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
	if got := queue.DefaultConcurrency()[queue.Maintenance]; got <= 0 {
		t.Fatalf("maintenance concurrency %d", got)
	}
	if _, err := queue.NewServer(queue.ServerConfig{RedisURL: url, Concurrency: queue.DefaultConcurrency()}); err != nil {
		t.Fatalf("valid config: %v", err)
	}
}
