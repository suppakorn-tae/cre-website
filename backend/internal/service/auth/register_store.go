package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// PGStore is the Postgres Store, backed by dal/queries/auth_register.sql.
type PGStore struct{ DB dal.DBTX }

var _ Store = PGStore{}

// EmailTaken implements Store.
func (p PGStore) EmailTaken(ctx context.Context, email string) (bool, error) {
	return sqlc.New(p.DB).AccountEmailExists(ctx, pgtype.Text{String: email, Valid: true})
}

// CreateAccount implements Store.
func (p PGStore) CreateAccount(ctx context.Context, a NewAccount) (Account, error) {
	org := pgtype.Text{}
	if a.Organisation != nil {
		org = pgtype.Text{String: *a.Organisation, Valid: true}
	}
	row, err := sqlc.New(p.DB).CreateRegisteredAccount(ctx, sqlc.CreateRegisteredAccountParams{
		ID:              a.ID,
		Email:           pgtype.Text{String: a.Email, Valid: true},
		PasswordHash:    pgtype.Text{String: a.PasswordHash, Valid: true},
		Organisation:    org,
		Pseudonym:       a.Pseudonym,
		TermsAcceptedAt: a.TermsAcceptedAt,
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if pgErr.ConstraintName == "account_pseudonym_uq" {
			return Account{}, errPseudonymUsed
		}
		return Account{}, ErrEmailTaken
	}
	if err != nil {
		return Account{}, err
	}
	out := Account{
		ID: row.ID, Email: row.Email.String, SessionVersion: int(row.SessionVersion),
		TermsAcceptedAt: row.TermsAcceptedAt, CreatedAt: row.CreatedAt,
	}
	if row.Organisation.Valid {
		out.Organisation = &row.Organisation.String
	}
	return out, nil
}
