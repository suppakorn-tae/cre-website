package session

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// PGStore is the Postgres Store, backed by the sqlc queries in
// dal/queries/session.sql.
type PGStore struct{ DB dal.DBTX }

var _ Store = PGStore{}

// parse turns an account id into a uuid; a malformed id is an unknown account.
func parse(id string) (uuid.UUID, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, ErrNoAccount
	}
	return u, nil
}

// GetRecord implements Store.
func (p PGStore) GetRecord(ctx context.Context, id string) (Record, error) {
	u, err := parse(id)
	if err != nil {
		return Record{}, err
	}
	row, err := sqlc.New(p.DB).GetAccountSession(ctx, u)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNoAccount
	}
	if err != nil {
		return Record{}, err
	}
	return Record{Role: string(row.Role), Status: string(row.Status), Version: int(row.SessionVersion)}, nil
}

// BumpVersion implements Store.
func (p PGStore) BumpVersion(ctx context.Context, id string) (int, error) {
	u, err := parse(id)
	if err != nil {
		return 0, err
	}
	v, err := sqlc.New(p.DB).BumpSessionVersion(ctx, u)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNoAccount
	}
	return int(v), err
}

// GetProfile implements Store.
func (p PGStore) GetProfile(ctx context.Context, id string) (Profile, error) {
	u, err := parse(id)
	if err != nil {
		return Profile{}, err
	}
	row, err := sqlc.New(p.DB).GetAccountProfile(ctx, u)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNoAccount
	}
	if err != nil {
		return Profile{}, err
	}
	pr := Profile{
		ID: row.ID.String(), Email: row.Email.String, Role: string(row.Role),
		HasPassword: row.HasPassword, HasGoogle: row.HasGoogle,
		TermsAcceptedAt: row.TermsAcceptedAt, CreatedAt: row.CreatedAt,
	}
	if row.Organisation.Valid {
		pr.Organisation = &row.Organisation.String
	}
	return pr, nil
}
