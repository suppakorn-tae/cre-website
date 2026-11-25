package auth

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// GooglePGStore is the Postgres GoogleStore (dal/queries/auth_google.sql).
type GooglePGStore struct{ DB dal.DBTX }

var _ GoogleStore = GooglePGStore{}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: true} }

func googleRow(id uuid.UUID, status sqlc.AccountStatus, ver int32, pw, g bool, err error) (GoogleAccount, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return GoogleAccount{}, ErrLoginNoAccount
	}
	if err != nil {
		return GoogleAccount{}, err
	}
	return GoogleAccount{ID: id.String(), Status: string(status), Version: int(ver), HasPassword: pw, HasGoogle: g}, nil
}

// BySub implements GoogleStore.
func (p GooglePGStore) BySub(ctx context.Context, sub string) (GoogleAccount, error) {
	r, err := sqlc.New(p.DB).GetAccountByGoogleSub(ctx, text(sub))
	return googleRow(r.ID, r.Status, r.SessionVersion, r.HasPassword, r.HasGoogle, err)
}

// ByEmail implements GoogleStore.
func (p GooglePGStore) ByEmail(ctx context.Context, email string) (GoogleAccount, error) {
	r, err := sqlc.New(p.DB).GetAccountForGoogleByEmail(ctx, text(email))
	return googleRow(r.ID, r.Status, r.SessionVersion, r.HasPassword, r.HasGoogle, err)
}

// ByID implements GoogleStore.
func (p GooglePGStore) ByID(ctx context.Context, id string) (GoogleAccount, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return GoogleAccount{}, ErrLoginNoAccount
	}
	r, err := sqlc.New(p.DB).GetAccountForGoogleByID(ctx, u)
	return googleRow(r.ID, r.Status, r.SessionVersion, r.HasPassword, r.HasGoogle, err)
}

// UnlinkSub implements GoogleStore.
func (p GooglePGStore) UnlinkSub(ctx context.Context, id string) (bool, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return false, nil
	}
	n, err := sqlc.New(p.DB).UnlinkGoogleSub(ctx, u)
	return n == 1, err
}

// uniqueErr maps a unique violation to the service error for its constraint.
func uniqueErr(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return err
	}
	switch pgErr.ConstraintName {
	case "account_google_sub_uq":
		return ErrGoogleAlreadyLinked
	case "account_pseudonym_uq":
		return errPseudonymUsed
	}
	return ErrEmailTaken
}

// LinkSub implements GoogleStore.
func (p GooglePGStore) LinkSub(ctx context.Context, id, sub string) (bool, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return false, nil
	}
	n, err := sqlc.New(p.DB).LinkGoogleSub(ctx, sqlc.LinkGoogleSubParams{ID: u, GoogleSub: text(sub)})
	return n == 1, uniqueErr(err)
}

// CreateGoogleAccount implements GoogleStore.
func (p GooglePGStore) CreateGoogleAccount(ctx context.Context, a NewAccount, sub string) (Account, error) {
	org := pgtype.Text{}
	if a.Organisation != nil {
		org = text(*a.Organisation)
	}
	row, err := sqlc.New(p.DB).CreateGoogleAccount(ctx, sqlc.CreateGoogleAccountParams{
		ID: a.ID, Email: text(a.Email), GoogleSub: text(sub), Organisation: org,
		Pseudonym: a.Pseudonym, TermsAcceptedAt: a.TermsAcceptedAt,
	})
	if err != nil {
		return Account{}, uniqueErr(err)
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
