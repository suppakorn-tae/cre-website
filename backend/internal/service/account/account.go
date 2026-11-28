// Package account holds the Account Service: a user manages their own
// account (UC-04). Every call takes the id of the signed-in account; nothing
// here reads another user's data.
package account

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
)

// Limits from the contract and BR-22.
const (
	MaxOrganisation = 200
	MinPassword     = 8
	MaxPassword     = 128
	// ReauthTTL is how long a completed Google re-authentication allows a
	// delete.
	ReauthTTL = 5 * time.Minute
)

// Errors the handler maps to HTTP statuses.
var (
	ErrNotFound = errors.New("account: not found")
	// ErrNoPassword: the account has no password to change (409 no_password).
	ErrNoPassword = errors.New("account: no password")
	// ErrReauthRequired: no password and no fresh Google re-authentication
	// (403 reauth_required).
	ErrReauthRequired = errors.New("account: re-authentication required")
)

// FieldError is a 422 with one field code.
type FieldError struct{ Field, Code string }

func (e *FieldError) Error() string { return "account: " + e.Field + ": " + e.Code }

// ReauthKey is the Valkey key the Google callback sets (with ReauthTTL) once
// a `reauth` sign-in completed for the account. Delete consumes it.
func ReauthKey(accountID string) string { return "account:reauth:" + accountID }

// Sessions is the part of the session service used here.
type Sessions interface {
	BumpVersion(ctx context.Context, accountID string) (int, error)
}

// DB is a pool: it starts transactions and runs plain queries.
type DB interface {
	dal.Beginner
	dal.DBTX
}

// Service manages the signed-in user's account.
type Service struct {
	db       DB
	sessions Sessions
	cache    valkey.StateStore
}

// New builds a Service.
func New(db DB, s Sessions, cache valkey.StateStore) *Service {
	return &Service{db: db, sessions: s, cache: cache}
}

// Account is the user's own account.
type Account struct {
	ID              uuid.UUID
	Email           string
	Role            string
	Organisation    *string
	Password        bool
	Google          bool
	TermsAcceptedAt *time.Time
	CreatedAt       time.Time
}

func toAccount(r sqlc.AccountGetOwnRow) Account {
	a := Account{
		ID: r.ID, Email: r.Email.String, Role: string(r.Role),
		Password: r.HasPassword, Google: r.HasGoogle, CreatedAt: r.CreatedAt,
	}
	if r.Organisation.Valid {
		a.Organisation = &r.Organisation.String
	}
	t := r.TermsAcceptedAt
	a.TermsAcceptedAt = &t
	return a
}

func get(ctx context.Context, db dal.DBTX, id uuid.UUID) (Account, error) {
	r, err := sqlc.New(db).AccountGetOwn(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrNotFound
	}
	if err != nil {
		return Account{}, fmt.Errorf("account: get: %w", err)
	}
	if r.Status != sqlc.AccountStatusActive {
		return Account{}, ErrNotFound
	}
	return toAccount(r), nil
}

// Get returns the account.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (Account, error) {
	return get(ctx, s.db, id)
}

// UpdateOrganisation sets the organisation. Nil or blank clears it.
func (s *Service) UpdateOrganisation(ctx context.Context, id uuid.UUID, org *string) (Account, error) {
	var v pgtype.Text
	if org != nil {
		if t := strings.TrimSpace(*org); t != "" {
			if utf8.RuneCountInString(t) > MaxOrganisation {
				return Account{}, &FieldError{Field: "/organisation", Code: "too_long"}
			}
			v = pgtype.Text{String: t, Valid: true}
		}
	}
	if err := sqlc.New(s.db).AccountSetOrganisation(ctx, sqlc.AccountSetOrganisationParams{Organisation: v, ID: id}); err != nil {
		return Account{}, fmt.Errorf("account: set organisation: %w", err)
	}
	return get(ctx, s.db, id)
}

// lock locks the active account row and returns its password hash ("" when
// it has none).
func lock(ctx context.Context, tx pgx.Tx, id uuid.UUID) (string, error) {
	r, err := sqlc.New(tx).AccountLockOwn(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("account: lock: %w", err)
	}
	if r.Status != sqlc.AccountStatusActive {
		return "", ErrNotFound
	}
	return r.PasswordHash.String, nil
}

// ChangePassword replaces the password after checking the current one, then
// ends every session. It returns the new session version so the caller can
// keep the current device signed in.
func (s *Service) ChangePassword(ctx context.Context, id uuid.UUID, current, next, confirm string) (int, error) {
	switch n := utf8.RuneCountInString(next); {
	case n < MinPassword:
		return 0, &FieldError{Field: "/new_password", Code: "password_too_short"}
	case n > MaxPassword:
		return 0, &FieldError{Field: "/new_password", Code: "too_long"}
	case auth.IsCommonPassword(next):
		return 0, &FieldError{Field: "/new_password", Code: auth.CodePasswordTooCommon}
	case next != confirm:
		return 0, &FieldError{Field: "/new_password_confirmation", Code: "password_mismatch"}
	}
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		hash, err := lock(ctx, tx, id)
		if err != nil {
			return err
		}
		if hash == "" {
			return ErrNoPassword
		}
		if !auth.VerifyPassword(current, hash) {
			return &FieldError{Field: "/current_password", Code: "current_password_incorrect"}
		}
		newHash, err := auth.HashPassword(next)
		if err != nil {
			return err
		}
		if err := sqlc.New(tx).AccountSetOwnPassword(ctx, sqlc.AccountSetOwnPasswordParams{
			PasswordHash: pgtype.Text{String: newHash, Valid: true}, ID: id,
		}); err != nil {
			return fmt.Errorf("account: set password: %w", err)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return s.sessions.BumpVersion(ctx, id.String())
}

// Delete anonymises the account (BR-13) and ends every session. An account
// with a password must send it; one without needs a Google re-authentication
// from the last ReauthTTL.
func (s *Service) Delete(ctx context.Context, id uuid.UUID, password *string) error {
	var reauth bool
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		hash, err := lock(ctx, tx, id)
		if err != nil {
			return err
		}
		if hash != "" {
			if password == nil || !auth.VerifyPassword(*password, hash) {
				return &FieldError{Field: "/current_password", Code: "current_password_incorrect"}
			}
		} else {
			if _, err := s.cache.Get(ctx, ReauthKey(id.String())); err != nil {
				if errors.Is(err, valkey.ErrNotFound) {
					return ErrReauthRequired
				}
				return fmt.Errorf("account: reauth check: %w", err)
			}
			reauth = true
		}
		// Same rules as the admin delete: one query, one definition.
		if err := sqlc.New(tx).AdminAnonymiseAccount(ctx, id); err != nil {
			return fmt.Errorf("account: anonymise: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if reauth {
		_ = s.cache.Del(ctx, ReauthKey(id.String()))
	}
	_, err = s.sessions.BumpVersion(ctx, id.String())
	return err
}
