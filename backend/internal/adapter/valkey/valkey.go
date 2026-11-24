// Package valkey is the adapter over Valkey for short-lived state and pub/sub.
//
// Every key written through StateStore expires: the interface has no way to
// store a value without a positive TTL.
package valkey

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ErrNotFound is returned by Get when the key does not exist or has expired.
var ErrNotFound = errors.New("valkey: key not found")

// ErrInvalidTTL is returned when a write is given a TTL of zero or less.
var ErrInvalidTTL = errors.New("valkey: ttl must be positive")

// StateStore keeps short-lived state. All writes require a positive TTL.
type StateStore interface {
	// Set stores value under key and expires it after ttl.
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	// Get returns the value, or ErrNotFound.
	Get(ctx context.Context, key string) ([]byte, error)
	// Del removes keys; missing keys are ignored.
	Del(ctx context.Context, keys ...string) error
	// Incr adds one and returns the new value. The key gets ttl when it has
	// no expiry yet, so a counter window starts at its first increment.
	Incr(ctx context.Context, key string, ttl time.Duration) (int64, error)
	// SetNX stores value only when key is absent and reports whether it did.
	SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error)
}

// Message is a pub/sub message.
type Message struct {
	Channel string
	Payload []byte
}

// PubSub publishes and subscribes to channels, for example cache invalidation.
type PubSub interface {
	Publish(ctx context.Context, channel string, payload []byte) error
	// Subscribe returns a stream of messages and a stop func that closes it.
	// The subscription is active when Subscribe returns. The stream also
	// closes when ctx is done.
	Subscribe(ctx context.Context, channel string) (<-chan Message, func() error, error)
}

// Client implements StateStore and PubSub on one connection pool.
type Client struct {
	rdb *redis.Client
}

var (
	_ StateStore = (*Client)(nil)
	_ PubSub     = (*Client)(nil)
)

// New parses a redis:// URL and returns a Client. It does not connect yet.
func New(rawURL string) (*Client, error) {
	opt, err := redis.ParseURL(rawURL)
	if err != nil {
		return nil, fmt.Errorf("valkey: parse url: %w", err)
	}
	return &Client{rdb: redis.NewClient(opt)}, nil
}

// Close releases the connection pool.
func (c *Client) Close() error { return c.rdb.Close() }

// Check is a readiness check; its signature matches health.Check, so it can be
// passed to health.Checker.Add("valkey", client.Check).
func (c *Client) Check(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

func checkTTL(ttl time.Duration) error {
	if ttl <= 0 {
		return ErrInvalidTTL
	}
	return nil
}

// Set implements StateStore.
func (c *Client) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	if err := checkTTL(ttl); err != nil {
		return err
	}
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

// Get implements StateStore.
func (c *Client) Get(ctx context.Context, key string) ([]byte, error) {
	b, err := c.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrNotFound
	}
	return b, err
}

// Del implements StateStore.
func (c *Client) Del(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return c.rdb.Del(ctx, keys...).Err()
}

// Incr implements StateStore.
func (c *Client) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	if err := checkTTL(ttl); err != nil {
		return 0, err
	}
	pipe := c.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.ExpireNX(ctx, key, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// SetNX implements StateStore.
func (c *Client) SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error) {
	if err := checkTTL(ttl); err != nil {
		return false, err
	}
	return c.rdb.SetNX(ctx, key, value, ttl).Result()
}

// Publish implements PubSub.
func (c *Client) Publish(ctx context.Context, channel string, payload []byte) error {
	return c.rdb.Publish(ctx, channel, payload).Err()
}

// Subscribe implements PubSub.
func (c *Client) Subscribe(ctx context.Context, channel string) (<-chan Message, func() error, error) {
	sub := c.rdb.Subscribe(ctx, channel)
	if _, err := sub.Receive(ctx); err != nil {
		_ = sub.Close()
		return nil, nil, fmt.Errorf("valkey: subscribe %q: %w", channel, err)
	}
	out := make(chan Message)
	in := sub.Channel()
	go func() {
		defer close(out)
		for {
			select {
			case m, ok := <-in:
				if !ok {
					return
				}
				select {
				case out <- Message{Channel: m.Channel, Payload: []byte(m.Payload)}:
				case <-ctx.Done():
					return
				}
			case <-ctx.Done():
				_ = sub.Close()
				return
			}
		}
	}()
	return out, sub.Close, nil
}
