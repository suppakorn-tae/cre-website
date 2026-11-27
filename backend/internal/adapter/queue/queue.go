// Package queue is the adapter over asynq for background jobs on Valkey.
package queue

import (
	"context"
	"errors"
	"fmt"

	"github.com/hibiken/asynq"
)

// Queue names. Each has its own concurrency budget on the server.
const (
	Reports = "reports"
	Exports = "exports"
	// Maintenance runs housekeeping tasks (the stuck-job sweep) so a long
	// export cannot hold them back.
	Maintenance = "maintenance"
)

// ErrUnknownQueue is returned for a queue name that is not configured.
var ErrUnknownQueue = errors.New("queue: unknown queue")

func knownQueue(q string) bool { return q == Reports || q == Exports || q == Maintenance }

func redisOpt(rawURL string) (asynq.RedisClientOpt, error) {
	o, err := asynq.ParseRedisURI(rawURL)
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("queue: parse url: %w", err)
	}
	ro, ok := o.(asynq.RedisClientOpt)
	if !ok {
		return asynq.RedisClientOpt{}, errors.New("queue: only single-node redis:// urls are supported")
	}
	return ro, nil
}

// Enqueuer puts jobs on a queue.
type Enqueuer interface {
	Enqueue(ctx context.Context, kind string, payload []byte, queue string) error
}

// Client enqueues jobs.
type Client struct {
	c *asynq.Client
}

var _ Enqueuer = (*Client)(nil)

// NewClient connects lazily to the Valkey at rawURL.
func NewClient(rawURL string) (*Client, error) {
	ro, err := redisOpt(rawURL)
	if err != nil {
		return nil, err
	}
	return &Client{c: asynq.NewClient(ro)}, nil
}

// Close releases the connection.
func (c *Client) Close() error { return c.c.Close() }

// Enqueue adds a job of the given kind to queue (Reports, Exports or Maintenance).
func (c *Client) Enqueue(ctx context.Context, kind string, payload []byte, queue string) error {
	if kind == "" {
		return errors.New("queue: empty job kind")
	}
	if !knownQueue(queue) {
		return fmt.Errorf("%w: %q", ErrUnknownQueue, queue)
	}
	_, err := c.c.EnqueueContext(ctx, asynq.NewTask(kind, payload), asynq.Queue(queue))
	return err
}

// Handler processes one job. Returning an error makes asynq retry it.
type Handler func(ctx context.Context, kind string, payload []byte) error

// ServerConfig configures Server. Concurrency maps queue name to the number of
// jobs of that queue that may run at once; every queue must be positive.
type ServerConfig struct {
	RedisURL    string
	Concurrency map[string]int
}

// DefaultConcurrency gives each queue its own small worker budget.
func DefaultConcurrency() map[string]int {
	return map[string]int{Reports: 2, Exports: 2, Maintenance: 1}
}

// Server runs job handlers with per-queue concurrency.
type Server struct {
	srv *asynq.Server
	mux *asynq.ServeMux
}

// NewServer builds a Server. asynq has one shared worker pool, so the pool
// size is the sum over queues and each queue's priority weight equals its
// concurrency, which shares the pool in that proportion.
func NewServer(cfg ServerConfig) (*Server, error) {
	ro, err := redisOpt(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	if len(cfg.Concurrency) == 0 {
		return nil, errors.New("queue: no queues configured")
	}
	total := 0
	for q, n := range cfg.Concurrency {
		if !knownQueue(q) {
			return nil, fmt.Errorf("%w: %q", ErrUnknownQueue, q)
		}
		if n <= 0 {
			return nil, fmt.Errorf("queue: concurrency for %q must be positive", q)
		}
		total += n
	}
	srv := asynq.NewServer(ro, asynq.Config{
		Concurrency: total,
		Queues:      cfg.Concurrency,
	})
	return &Server{srv: srv, mux: asynq.NewServeMux()}, nil
}

// Handle registers h for jobs of kind. Call it before Start.
func (s *Server) Handle(kind string, h Handler) {
	s.mux.HandleFunc(kind, func(ctx context.Context, t *asynq.Task) error {
		return h(ctx, t.Type(), t.Payload())
	})
}

// Start begins processing in the background and returns at once.
func (s *Server) Start() error { return s.srv.Start(s.mux) }

// Stop stops fetching new jobs and waits for running ones (up to asynq's
// shutdown timeout) before returning.
func (s *Server) Stop() { s.srv.Shutdown() }
