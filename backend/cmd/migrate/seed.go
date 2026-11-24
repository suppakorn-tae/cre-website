package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/seed"
)

// runAndSeed runs the migrate command and, after a successful "up", loads
// the catalogue seed. The seed is insert-if-absent, so admin edits survive.
func runAndSeed(args []string, databaseURL string) error {
	if err := run(args, databaseURL); err != nil {
		return err
	}
	if len(args) == 1 && args[0] == "up" {
		return seedCatalogue(context.Background(), databaseURL)
	}
	return nil
}

func seedCatalogue(ctx context.Context, databaseURL string) error {
	cat, err := seed.Load()
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("connect for seed: %w", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	if err := seed.Apply(ctx, conn, cat); err != nil {
		return err
	}
	slog.Info("seed done", "indicators", len(cat.Indicators))
	return nil
}
