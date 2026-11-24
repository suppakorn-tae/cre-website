package catalogue_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
)

// fakeRepo returns a snapshot whose indicator name is the load count.
type fakeRepo struct{ loads atomic.Int32 }

func (r *fakeRepo) Load(context.Context) (*catalogue.Snapshot, error) {
	n := r.loads.Add(1)
	return testSnapshot(int(n)), nil
}

func testSnapshot(n int) *catalogue.Snapshot {
	a, c, d, e := engine.F(1), engine.F(3), engine.F(4), engine.F(5)
	s, err := catalogue.NewSnapshot(
		[]catalogue.Dimension{{
			Code: "EC", Name: catalogue.Text{"th": "เศรษฐกิจ"},
			Factors: []catalogue.Factor{{
				Code: "EC-MG", Name: catalogue.Text{"th": "มหภาค"},
				Indicators: []catalogue.Indicator{{
					Code: "EC-MG-1",
					Thresholds: engine.Thresholds{
						A: a, B: engine.F(2), C: c, D: d, E: e, Direction: engine.DirectionNormal,
					},
					Name:       catalogue.Text{"th": "ชื่อ", "en": string(rune('0' + n))},
					Unit:       catalogue.Text{"th": "ครั้ง"},
					QuestionX:  catalogue.Text{"th": "คำถาม"},
					QuestionY1: catalogue.Text{},
				}},
			}},
		}},
		[]catalogue.RiEOption{{Code: "A", Score: 1, IsExclusive: true, Label: catalogue.Text{"th": "ไม่มี"}}},
		map[string]catalogue.ImpactTable{catalogue.ImpactCost: {A: 1, B: 2, C: 3, D: 4, E: 5}},
		map[catalogue.AdviceKey][]catalogue.AdviceItem{
			{Indicator: "EC-MG-1", List: "RL"}: {{ID: "1", Position: 1, Text: catalogue.Text{"th": "คำแนะนำ"}}},
		},
		[]string{"koh_tao", "other"}, []string{"building", "other"},
	)
	if err != nil {
		panic(err)
	}
	return s
}

// memBus is an in-process PubSub shared by several services, standing in for
// Valkey.
type memBus struct {
	mu   sync.Mutex
	subs []chan valkey.Message
}

func (b *memBus) Publish(_ context.Context, ch string, p []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, s := range b.subs {
		s <- valkey.Message{Channel: ch, Payload: p}
	}
	return nil
}

func (b *memBus) Subscribe(_ context.Context, _ string) (<-chan valkey.Message, func() error, error) {
	ch := make(chan valkey.Message, 16)
	b.mu.Lock()
	b.subs = append(b.subs, ch)
	b.mu.Unlock()
	return ch, func() error { return nil }, nil
}

func TestSnapshotLoadsLazilyOnce(t *testing.T) {
	repo := &fakeRepo{}
	s := catalogue.New(repo, &memBus{}, nil)
	if repo.loads.Load() != 0 {
		t.Fatal("loaded before first read")
	}
	a, err := s.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	b, _ := s.Snapshot(context.Background())
	if a != b || repo.loads.Load() != 1 {
		t.Fatalf("want one load and one shared snapshot, got %d loads", repo.loads.Load())
	}
}

func TestInvalidateReloadsLocally(t *testing.T) {
	repo := &fakeRepo{}
	s := catalogue.New(repo, &memBus{}, nil)
	a, _ := s.Snapshot(context.Background())
	if err := s.Invalidate(context.Background()); err != nil {
		t.Fatal(err)
	}
	b, _ := s.Snapshot(context.Background())
	if a == b || a.Version() == b.Version() {
		t.Fatal("snapshot not reloaded after Invalidate")
	}
}

func TestInvalidateOnAReloadsB(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	bus := &memBus{}
	repoA, repoB := &fakeRepo{}, &fakeRepo{}
	a, b := catalogue.New(repoA, bus, nil), catalogue.New(repoB, bus, nil)
	if err := b.Start(ctx); err != nil {
		t.Fatal(err)
	}
	before, _ := b.Snapshot(ctx)

	if err := a.Invalidate(ctx); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		after, _ := b.Snapshot(ctx)
		if after.Version() != before.Version() {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("replica B still serves the old snapshot")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestSnapshotLookups(t *testing.T) {
	s := testSnapshot(1)
	th, ok := s.Thresholds("EC-MG-1")
	if !ok || th.Direction != engine.DirectionNormal || *th.E != 5 {
		t.Fatalf("thresholds: %+v %v", th, ok)
	}
	if _, ok := s.Thresholds("nope"); ok {
		t.Fatal("unknown indicator found")
	}
	if tbl, ok := s.ImpactTable(catalogue.ImpactCost); !ok || tbl.E != 5 {
		t.Fatalf("impact: %+v", tbl)
	}
	// English advice is missing, so the th text is served.
	if got := s.Advice("EC-MG-1", "RL", "en"); len(got) != 1 || got[0] != "คำแนะนำ" {
		t.Fatalf("advice: %v", got)
	}
	if got := s.Advice("EC-MG-1", "RI_C", "th"); len(got) != 0 {
		t.Fatalf("want no advice, got %v", got)
	}
}

func TestTextFallback(t *testing.T) {
	txt := catalogue.Text{"th": "ไทย", "en": "english"}
	if txt.In("en") != "english" || txt.In("de") != "ไทย" {
		t.Fatal("fallback to th failed")
	}
	if (catalogue.Text{}).Ptr("th") != nil {
		t.Fatal("absent text must be nil")
	}
}
