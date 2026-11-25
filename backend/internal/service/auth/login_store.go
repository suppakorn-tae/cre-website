package auth

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// LoginPGStore is the Postgres LoginStore (dal/queries/auth_login.sql).
type LoginPGStore struct{ DB dal.DBTX }

var _ LoginStore = LoginPGStore{}

// ByEmail implements LoginStore.
func (p LoginPGStore) ByEmail(ctx context.Context, email string) (LoginAccount, error) {
	row, err := sqlc.New(p.DB).GetAccountForLogin(ctx, pgtype.Text{String: email, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return LoginAccount{}, ErrLoginNoAccount
	}
	if err != nil {
		return LoginAccount{}, err
	}
	return LoginAccount{
		ID: row.ID.String(), PasswordHash: row.PasswordHash.String, HasGoogle: row.HasGoogle,
		Status: string(row.Status), Version: int(row.SessionVersion),
	}, nil
}

// SetPasswordHash implements LoginStore.
func (p LoginPGStore) SetPasswordHash(ctx context.Context, id, hash string) error {
	u, err := uuid.Parse(id)
	if err != nil {
		return ErrLoginNoAccount
	}
	n, err := sqlc.New(p.DB).SetAccountPasswordHash(ctx, sqlc.SetAccountPasswordHashParams{
		ID: u, PasswordHash: pgtype.Text{String: hash, Valid: true},
	})
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrLoginNoAccount
	}
	return nil
}
