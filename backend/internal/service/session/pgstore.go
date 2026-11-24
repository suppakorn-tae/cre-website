package session

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStore is the Postgres Store. Its SQL is the same as
// dal/queries/session.sql (GetAccountSession, BumpSessionVersion).
type PGStore struct{ Pool *pgxpool.Pool }

var _ Store = PGStore{}

// GetRecord implements Store.
func (p PGStore) GetRecord(ctx context.Context, id string) (Record, error) {
	var r Record
	err := p.Pool.QueryRow(ctx,
		`SELECT role::text, status::text, session_version FROM account WHERE id = $1`, id,
	).Scan(&r.Role, &r.Status, &r.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNoAccount
	}
	return r, err
}

// BumpVersion implements Store.
func (p PGStore) BumpVersion(ctx context.Context, id string) (int, error) {
	var v int
	err := p.Pool.QueryRow(ctx,
		`UPDATE account SET session_version = session_version + 1, updated_at = now()
		 WHERE id = $1 RETURNING session_version`, id,
	).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNoAccount
	}
	return v, err
}
