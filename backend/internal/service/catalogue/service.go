package catalogue

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// Channel is the Valkey pub/sub channel that carries invalidations.
const Channel = "catalogue:invalidate"

const resubscribeDelay = time.Second

// Service holds this replica's catalogue snapshot.
type Service struct {
	repo   Repository
	ps     valkey.PubSub
	log    *slog.Logger
	snap   atomic.Pointer[Snapshot]
	gen    atomic.Uint64 // bumped on every drop, so a stale load is not stored
	loadMu sync.Mutex
}

// New builds a Service. Call Start to listen for invalidations from other
// replicas.
func New(repo Repository, ps valkey.PubSub, log *slog.Logger) *Service {
	if log == nil {
		log = slog.Default()
	}
	return &Service{repo: repo, ps: ps, log: log}
}

// Snapshot returns the current catalogue, loading it on first use. The result
// is immutable and safe to keep for the duration of a request.
func (s *Service) Snapshot(ctx context.Context) (*Snapshot, error) {
	if p := s.snap.Load(); p != nil {
		return p, nil
	}
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	if p := s.snap.Load(); p != nil {
		return p, nil
	}
	gen := s.gen.Load()
	p, err := s.repo.Load(ctx)
	if err != nil {
		return nil, err
	}
	// An invalidation that arrived during the load makes this copy suspect:
	// serve it once but do not keep it.
	if s.gen.Load() == gen {
		s.snap.Store(p)
	}
	return p, nil
}

// Invalidate drops this replica's snapshot and tells every replica to do the
// same. Call it after an admin edit has committed. The local drop happens
// even when publishing fails, and the error says other replicas may be stale.
func (s *Service) Invalidate(ctx context.Context) error {
	s.drop()
	if err := s.ps.Publish(ctx, Channel, []byte("1")); err != nil {
		return fmt.Errorf("catalogue: publish invalidation: %w", err)
	}
	return nil
}

func (s *Service) drop() {
	s.gen.Add(1)
	s.snap.Store(nil)
}

// Start subscribes to invalidations and reloads the snapshot on each one,
// until ctx is done. It returns once the subscription is active. After a lost
// connection it resubscribes and drops the snapshot, since messages may have
// been missed.
func (s *Service) Start(ctx context.Context) error {
	msgs, stop, err := s.ps.Subscribe(ctx, Channel)
	if err != nil {
		return fmt.Errorf("catalogue: %w", err)
	}
	go s.run(ctx, msgs, stop)
	return nil
}

func (s *Service) run(ctx context.Context, msgs <-chan valkey.Message, stop func() error) {
	for {
		for range msgs {
			s.reload(ctx)
		}
		_ = stop()
		for ctx.Err() == nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(resubscribeDelay):
			}
			var err error
			if msgs, stop, err = s.ps.Subscribe(ctx, Channel); err == nil {
				s.reload(ctx) // may have missed messages while disconnected
				break
			}
			s.log.Warn("catalogue: resubscribe failed", "error", err)
		}
		if ctx.Err() != nil {
			return
		}
	}
}

// reload drops the snapshot and loads the new one right away. A failed load
// is not fatal: the next read retries.
func (s *Service) reload(ctx context.Context) {
	s.drop()
	if _, err := s.Snapshot(ctx); err != nil {
		s.log.Warn("catalogue: reload failed, will retry on next read", "error", err)
	}
}
