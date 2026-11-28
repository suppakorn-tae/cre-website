// Package testutil starts a migrated and seeded Postgres in a container and
// builds test data with one fixture builder per domain, so a service test
// never calls another service.
package testutil

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers pgx5://
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/seed"
	"github.com/suppakorn-tae/cre-website/backend/migrations"
)

// PostgresImage is the image every testcontainers Postgres uses. Keep it
// equal to the db image in deploy/compose/compose.yaml and in CI.
const PostgresImage = "postgres:19.0-trixie"

// DB is what the fixture builders need. *pgxpool.Pool, *pgx.Conn and pgx.Tx
// all satisfy it.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// NewDB starts Postgres, applies every migration, loads the catalogue seed
// and returns a pool connected as the application role cre_app, the role api
// and worker use in production. A query that needs more than cre_app has
// fails the test. The container is removed when the test ends.
//
// Use NewOwnerDB when a test must change the schema or touch audit_log.
func NewDB(t testing.TB) *pgxpool.Pool {
	t.Helper()
	return NewAppPool(t, NewOwnerDB(t))
}

// NewOwnerDB is NewDB with a pool connected as the schema owner (a
// superuser in the test container).
func NewOwnerDB(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := NewEmptyDB(t)
	ctx := context.Background()
	if err := Migrate(url); err != nil {
		t.Fatalf("migrate up: %v", err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	cat, err := seed.Load()
	if err != nil {
		t.Fatalf("load seed: %v", err)
	}
	if err := seed.Apply(ctx, pool, cat); err != nil {
		t.Fatalf("apply seed: %v", err)
	}
	return pool
}

// AppRole is the application role (cre_app) that api and worker connect as.
const AppRole = "cre_app"

// NewAppPool returns a pool connected as the application role to the same
// database as owner, a pool made by NewDB. Use it for tests that must run
// with the grants of production: a query that needs more than cre_app has
// fails here with SQLSTATE 42501 instead of in the deployed stack.
func NewAppPool(t testing.TB, owner *pgxpool.Pool) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	const password = "cre-app-test-password" //nolint:gosec // throwaway password of a testcontainers database
	// ALTER ROLE takes no bind parameters; the password is a constant here.
	if _, err := owner.Exec(ctx, `ALTER ROLE `+AppRole+` WITH LOGIN PASSWORD '`+password+`'`); err != nil {
		t.Fatalf("set %s password: %v", AppRole, err)
	}
	cfg := owner.Config()
	cfg.ConnConfig.User, cfg.ConnConfig.Password = AppRole, password
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect as %s: %v", AppRole, err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// NewEmptyDB starts Postgres without any schema and returns its URL.
func NewEmptyDB(t testing.TB) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, PostgresImage,
		tcpostgres.WithDatabase("cre"),
		tcpostgres.WithUsername("cre"),
		tcpostgres.WithPassword("cre"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").
			WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("start postgres: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	return url
}

// Migrate applies every embedded migration to the database at url.
func Migrate(url string) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("open embedded migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, "pgx5://"+strings.TrimPrefix(url, "postgres://"))
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()
	return m.Up()
}

// NewID returns a random UUID (version 4) as text.
func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func must(t testing.TB, err error, what string) {
	t.Helper()
	if err != nil {
		t.Fatalf("fixture %s: %v", what, err)
	}
}
