// Command migrate applies the embedded SQL migrations with golang-migrate.
//
// Usage: migrate up | down | version
//
// The database is read from DATABASE_URL (postgres:// or postgresql://), as
// the schema owner. After "up", when APP_DB_PASSWORD is set, the password of
// the application role cre_app is set to it.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers pgx5://
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/suppakorn-tae/cre-website/backend/migrations"
)

func main() {
	if err := runAll(os.Args[1:], os.Getenv("DATABASE_URL"), os.Getenv("APP_DB_PASSWORD")); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}
}

// runAll runs the command, seeds after "up" and then sets the application
// role password.
func runAll(args []string, databaseURL, appPassword string) error {
	if err := runAndSeed(args, databaseURL); err != nil {
		return err
	}
	if len(args) == 1 && args[0] == "up" {
		return setAppPassword(context.Background(), databaseURL, appPassword)
	}
	return nil
}

func run(args []string, databaseURL string) error {
	if len(args) != 1 {
		return errors.New("usage: migrate up | down | version")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL is not set")
	}
	m, err := newMigrator(databaseURL)
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()

	switch args[0] {
	case "up":
		err = m.Up()
	case "down":
		err = m.Down()
	case "version":
		v, dirty, verr := m.Version()
		if verr != nil && !errors.Is(verr, migrate.ErrNilVersion) {
			return verr
		}
		slog.Info("migrate version", "version", v, "dirty", dirty)
		return nil
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	slog.Info("migrate done", "command", args[0])
	return nil
}

func newMigrator(databaseURL string) (*migrate.Migrate, error) {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return nil, fmt.Errorf("open embedded migrations: %w", err)
	}
	return migrate.NewWithSourceInstance("iofs", src, toPgx5URL(databaseURL))
}

// toPgx5URL selects golang-migrate's pgx v5 driver, which is registered under
// the pgx5 scheme.
func toPgx5URL(u string) string {
	for _, p := range []string{"postgresql://", "postgres://"} {
		if rest, ok := strings.CutPrefix(u, p); ok {
			return "pgx5://" + rest
		}
	}
	return u
}
