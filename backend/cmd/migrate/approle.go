package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
)

// appRole is the application role created by the roles migration. It has no
// password there; deployment sets one from APP_DB_PASSWORD.
const appRole = "cre_app"

// setAppPassword makes cre_app able to log in with password. It runs as the
// schema owner after "up", on every start of migrate, so it also rotates the
// password when APP_DB_PASSWORD changes. An empty password does nothing.
//
// ALTER ROLE accepts no bind parameters, so the statement is built on the
// server with format(%L), which quotes any string safely (single quotes,
// backslashes). The password is never logged.
func setAppPassword(ctx context.Context, databaseURL, password string) error {
	if password == "" {
		slog.Info("APP_DB_PASSWORD is not set, leaving the application role password unchanged", "role", appRole)
		return nil
	}
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("connect to set %s password: %w", appRole, err)
	}
	defer func() { _ = conn.Close(ctx) }()

	var stmt string
	err = conn.QueryRow(ctx,
		`SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text)`,
		appRole, password).Scan(&stmt)
	if err != nil {
		return fmt.Errorf("quote %s password: %w", appRole, err)
	}
	if _, err := conn.Exec(ctx, stmt); err != nil {
		// The server error never contains the statement text, but make sure
		// the password cannot leak through a wrapped message either.
		msg := strings.ReplaceAll(err.Error(), password, "***")
		return fmt.Errorf("set %s password: %w", appRole, errors.New(msg))
	}
	slog.Info("application role password set", "role", appRole)
	return nil
}
