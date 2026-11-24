// Package auth holds the account log in and password reset services.
package auth

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Errors returned by Login.
var (
	// ErrInvalidCredentials covers a wrong password, an unknown e-mail and
	// an account without a password (HTTP 401, never says which).
	ErrInvalidCredentials = errors.New("auth: invalid credentials")
	// ErrAccountUnavailable is a deactivated or deleted account (HTTP 403).
	ErrAccountUnavailable = errors.New("auth: account unavailable")
)

// Account status as stored in the account table.
const loginStatusActive = "active"

// ErrLoginNoAccount is returned by LoginStore when the e-mail is unknown.
var ErrLoginNoAccount = errors.New("auth: account not found")

// LoginAccount is the part of an account row that log in and reset need.
type LoginAccount struct {
	ID           string
	PasswordHash string // empty when the account has no password
	HasGoogle    bool
	Status       string
	Version      int
}

// LoginStore reads and updates accounts in Postgres.
type LoginStore interface {
	// ByEmail returns ErrLoginNoAccount for an unknown e-mail.
	ByEmail(ctx context.Context, email string) (LoginAccount, error)
	// SetPasswordHash stores a new hash for an active account and returns
	// ErrLoginNoAccount when no active account has that id.
	SetPasswordHash(ctx context.Context, id, hash string) error
}

// LoginSessions is the part of session.Service the services use.
type LoginSessions interface {
	Issue(accountID string, version int, remember bool) (string, time.Time)
	BumpVersion(ctx context.Context, accountID string) (int, error)
}

// LoginResult is a new session.
type LoginResult struct {
	AccountID string
	Token     string
	Expires   time.Time
	Remember  bool
}

// LoginService checks credentials and starts sessions.
type LoginService struct {
	store    LoginStore
	sessions LoginSessions
	// dummy is verified when no real hash exists, so a missing account takes
	// as long as a wrong password.
	dummy string
}

// NewLoginService builds the service.
func NewLoginService(store LoginStore, sessions LoginSessions) (*LoginService, error) {
	dummy, err := HashPassword("dummy-password-for-timing")
	if err != nil {
		return nil, err
	}
	return &LoginService{store: store, sessions: sessions, dummy: dummy}, nil
}

// Login verifies the password and issues a session. Exactly one Argon2id
// verification runs on every path, so timing does not tell the cases apart.
// A deactivated account is reported only after the password was right.
func (s *LoginService) Login(ctx context.Context, email, password string, keep bool) (LoginResult, error) {
	acc, err := s.store.ByEmail(ctx, NormaliseEmail(email))
	if err != nil && !errors.Is(err, ErrLoginNoAccount) {
		return LoginResult{}, fmt.Errorf("auth: load account: %w", err)
	}
	hash := acc.PasswordHash
	known := err == nil && hash != ""
	if !known {
		hash = s.dummy
	}
	ok := VerifyPassword(password, hash)
	if !known || !ok {
		return LoginResult{}, ErrInvalidCredentials
	}
	if acc.Status != loginStatusActive {
		return LoginResult{}, ErrAccountUnavailable
	}
	token, exp := s.sessions.Issue(acc.ID, acc.Version, keep)
	return LoginResult{AccountID: acc.ID, Token: token, Expires: exp, Remember: keep}, nil
}
