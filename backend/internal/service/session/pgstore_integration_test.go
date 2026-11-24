package session_test

import (
	"context"
	"errors"
	"io/fs"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/migrations"
)

func startPG(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("cre"), tcpostgres.WithUsername("cre"), tcpostgres.WithPassword("cre"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("start postgres: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	names, _ := fs.Glob(migrations.FS, "*.up.sql")
	sort.Strings(names)
	for _, n := range names {
		b, _ := fs.ReadFile(migrations.FS, n)
		if _, err := pool.Exec(ctx, string(b)); err != nil {
			t.Fatalf("apply %s: %v", n, err)
		}
	}
	return pool
}

func startValkey(t *testing.T) *valkey.Client {
	t.Helper()
	ctx := context.Background()
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "valkey/valkey:8-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor:   wait.ForListeningPort("6379/tcp"),
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

func TestPGStoreWithValkey(t *testing.T) {
	ctx := context.Background()
	pool := startPG(t)
	cache := startValkey(t)
	const id = "7d1c0a3e-5b0e-4b7a-9a43-0d2f4a1e9c11"
	_, err := pool.Exec(ctx, `INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		VALUES ($1, 'a@example.com', 'x', 'p-1', now())`, id)
	if err != nil {
		t.Fatal(err)
	}

	svc, err := session.New(session.Config{
		Secret: []byte(strings.Repeat("k", 32)), CacheTTL: time.Minute,
	}, session.PGStore{Pool: pool}, cache)
	if err != nil {
		t.Fatal(err)
	}

	tok, _ := svc.Issue(id, 1, false)
	p, err := svc.Authenticate(ctx, tok)
	if err != nil || p.Role != session.RoleUser {
		t.Fatalf("auth: %+v %v", p, err)
	}

	// Cached: a change made behind the service's back is not seen yet ...
	if _, err := pool.Exec(ctx, `UPDATE account SET status = 'deactivated' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, tok); err != nil {
		t.Fatalf("cached read: %v", err)
	}
	// ... but a bump drops the cache and the old cookie fails at once.
	v, err := svc.BumpVersion(ctx, id)
	if err != nil || v != 2 {
		t.Fatalf("bump: %d %v", v, err)
	}
	if _, err := svc.Authenticate(ctx, tok); !errors.Is(err, session.ErrRevoked) {
		t.Fatalf("after bump: %v", err)
	}

	if _, err := (session.PGStore{Pool: pool}).GetRecord(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, session.ErrNoAccount) {
		t.Fatalf("missing: %v", err)
	}
}
