package catalogue_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func startValkey(t *testing.T) *valkey.Client {
	t.Helper()
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

func newReplica(ctx context.Context, t *testing.T, pool *pgxpool.Pool, vk *valkey.Client) *catalogue.Service {
	t.Helper()
	s := catalogue.New(catalogue.PGRepository{DB: pool}, vk, nil)
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestPGRepositoryLoadsSeed(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	snap, err := catalogue.PGRepository{DB: pool}.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, d := range snap.Dimensions {
		for _, f := range d.Factors {
			n += len(f.Indicators)
		}
	}
	if len(snap.Dimensions) != 3 || n != 55 || len(snap.RiEOptions) != 9 {
		t.Fatalf("dimensions=%d indicators=%d options=%d", len(snap.Dimensions), n, len(snap.RiEOptions))
	}
	if n := len(snap.Islands); n != 8 || snap.Islands[0] != "koh_tao" || snap.Islands[n-1] != "other" {
		t.Fatalf("islands: %v", snap.Islands)
	}
	if n := len(snap.ProjectTypes); n == 0 || snap.ProjectTypes[n-1] != "other" {
		t.Fatalf("project types: %v", snap.ProjectTypes)
	}
	if _, ok := snap.ImpactTable(catalogue.ImpactCost); !ok {
		t.Fatal("RI_C table missing")
	}
	if _, ok := snap.ImpactTable(catalogue.ImpactTime); !ok {
		t.Fatal("RI_T table missing")
	}
	th, ok := snap.Thresholds(snap.Dimensions[0].Factors[0].Indicators[0].Code)
	if !ok || th.C == nil {
		t.Fatalf("thresholds: %+v", th)
	}
}

// TestInvalidateOnAServesNewDataOnB: two replicas share Postgres and Valkey.
// After an edit and Invalidate on A, B serves the new data.
func TestInvalidateOnAServesNewDataOnB(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pool := testutil.NewDB(t)
	vk := startValkey(t)
	a, b := newReplica(ctx, t, pool, vk), newReplica(ctx, t, pool, vk)

	before, err := b.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	code := before.Dimensions[0].Factors[0].Indicators[0].Code

	if _, err := pool.Exec(ctx,
		`UPDATE indicator_text SET name = 'edited' WHERE indicator_code = $1 AND locale = 'th'`, code); err != nil {
		t.Fatal(err)
	}
	// Still cached: B does not see the edit until it is told.
	if again, _ := b.Snapshot(ctx); again.Dimensions[0].Factors[0].Indicators[0].Name["th"] == "edited" {
		t.Fatal("B saw the edit before invalidation")
	}
	if err := a.Invalidate(ctx); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		s, err := b.Snapshot(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if s.Dimensions[0].Factors[0].Indicators[0].Name["th"] == "edited" {
			if s.Version() == before.Version() {
				t.Fatal("version unchanged after edit")
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("replica B did not serve the edited catalogue")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
