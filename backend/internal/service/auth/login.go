// Package auth holds the account log in and password reset services.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP minimum profile). The PHC string carries them,
// so they can be raised later without breaking stored hashes.
const (
	loginArgonMemory  = 19 * 1024 // KiB
	loginArgonTime    = 2
	loginArgonThreads = 1
	loginArgonKeyLen  = 32
	loginArgonSaltLen = 16
)

// loginHashSecret returns the Argon2id PHC string of secret.
func loginHashSecret(secret string) (string, error) {
	salt := make([]byte, loginArgonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: salt: %w", err)
	}
	key := argon2.IDKey([]byte(secret), salt, loginArgonTime, loginArgonMemory, loginArgonThreads, loginArgonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version,
		loginArgonMemory, loginArgonTime, loginArgonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// HashPassword returns the Argon2id PHC string of a password, for fixtures
// and other services that store passwords in the same format.
func HashPassword(password string) (string, error) { return loginHashSecret(password) }

// loginVerifySecret reports whether secret matches the PHC string. A string
// that cannot be parsed never matches.
func loginVerifySecret(secret, phc string) bool {
	parts := strings.Split(phc, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	if m == 0 || m > 256*1024 || t == 0 || t > 10 || p == 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false
	}
	got := argon2.IDKey([]byte(secret), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

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
	dummy, err := loginHashSecret("dummy-password-for-timing")
	if err != nil {
		return nil, err
	}
	return &LoginService{store: store, sessions: sessions, dummy: dummy}, nil
}

// loginNormaliseEmail trims and lower-cases an e-mail.
func loginNormaliseEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// Login verifies the password and issues a session. Exactly one Argon2id
// verification runs on every path, so timing does not tell the cases apart.
// A deactivated account is reported only after the password was right.
func (s *LoginService) Login(ctx context.Context, email, password string, keep bool) (LoginResult, error) {
	acc, err := s.store.ByEmail(ctx, loginNormaliseEmail(email))
	if err != nil && !errors.Is(err, ErrLoginNoAccount) {
		return LoginResult{}, fmt.Errorf("auth: load account: %w", err)
	}
	hash := acc.PasswordHash
	known := err == nil && hash != ""
	if !known {
		hash = s.dummy
	}
	ok := loginVerifySecret(password, hash)
	if !known || !ok {
		return LoginResult{}, ErrInvalidCredentials
	}
	if acc.Status != loginStatusActive {
		return LoginResult{}, ErrAccountUnavailable
	}
	token, exp := s.sessions.Issue(acc.ID, acc.Version, keep)
	return LoginResult{AccountID: acc.ID, Token: token, Expires: exp, Remember: keep}, nil
}
