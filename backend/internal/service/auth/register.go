// Package auth holds the account sign-up service. Sign-up is two steps: Start
// keeps a pending sign-up in Valkey only and e-mails an OTP; Verify creates
// the account in Postgres once the OTP is right.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// Rules from BR-16 and BR-22.
const (
	// OTPTTL is how long a code and its pending sign-up live.
	OTPTTL = 10 * time.Minute
	// ResendCooldown is the minimum time between two codes for one e-mail.
	ResendCooldown = 60 * time.Second
	// MaxWrongAttempts wrong codes are tolerated; one more locks the sign-up.
	MaxWrongAttempts = 5

	minPasswordRunes = 8
	maxPasswordRunes = 128
	maxEmailLen      = 254
	maxOrgRunes      = 200
)

// Field error codes (FieldError.code in the contract).
const (
	CodeInvalidEmail      = "invalid_email"
	CodePasswordTooShort  = "password_too_short"
	CodePasswordMismatch  = "password_mismatch"
	CodeRetentionRequired = "retention_not_accepted"
	CodeTermsRequired     = "terms_not_accepted"
	CodeOrgTooLong        = "organisation_too_long"
)

// Errors a caller maps to HTTP statuses.
var (
	ErrEmailTaken    = errors.New("auth: e-mail already registered")
	ErrNoPending     = errors.New("auth: no pending sign-up")
	ErrOTPInvalid    = errors.New("auth: wrong code")
	ErrOTPExpired    = errors.New("auth: code expired")
	ErrOTPLocked     = errors.New("auth: too many wrong codes")
	ErrMailFailed    = errors.New("auth: could not send e-mail")
	errPseudonymUsed = errors.New("auth: pseudonym already used")
)

// FieldError is one rejected field; Field is a JSON pointer such as
// "/password".
type FieldError struct{ Field, Code string }

// ValidationError lists every rejected field of a request.
type ValidationError []FieldError

func (v ValidationError) Error() string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = f.Field + ": " + f.Code
	}
	return "auth: invalid request (" + strings.Join(parts, ", ") + ")"
}

// CooldownError is returned when a code was sent less than ResendCooldown ago.
type CooldownError struct{ RetryAfter time.Duration }

func (e CooldownError) Error() string {
	return "auth: next code in " + e.RetryAfter.String()
}

// StartInput is the sign-up form.
type StartInput struct {
	Email                string
	Password             string
	PasswordConfirmation string
	Organisation         string
	RetentionAccepted    bool
	TermsAccepted        bool
}

// Challenge tells the client how long the code lives and when it may ask for
// a new one.
type Challenge struct {
	ExpiresIn, ResendIn time.Duration
}

// NewAccount is what the store inserts.
type NewAccount struct {
	ID              uuid.UUID
	Email           string
	PasswordHash    string
	Organisation    *string
	Pseudonym       string
	TermsAcceptedAt time.Time
}

// Account is the created account.
type Account struct {
	ID              uuid.UUID
	Email           string
	Organisation    *string
	SessionVersion  int
	TermsAcceptedAt time.Time
	CreatedAt       time.Time
}

// Store is the Postgres side of sign-up.
type Store interface {
	EmailTaken(ctx context.Context, email string) (bool, error)
	// CreateAccount returns ErrEmailTaken or errPseudonymUsed on a unique
	// violation.
	CreateAccount(ctx context.Context, a NewAccount) (Account, error)
}

// Register runs the sign-up flow.
type Register struct {
	store Store
	cache valkey.StateStore
	mail  mailer.Mailer
	now   func() time.Time
}

// NewRegister builds the service.
func NewRegister(store Store, cache valkey.StateStore, m mailer.Mailer) *Register {
	return &Register{store: store, cache: cache, mail: m, now: time.Now}
}

// pending is the sign-up kept in Valkey. It never reaches Postgres.
type pending struct {
	PasswordHash  string    `json:"pw"`
	Organisation  string    `json:"org,omitempty"`
	TermsAt       time.Time `json:"terms_at"`
	OTPSalt       []byte    `json:"salt"`
	OTPHash       []byte    `json:"otp"`
	OTPExpiresAt  time.Time `json:"otp_exp"`
	CooldownUntil time.Time `json:"cool_until"`
}

func pendingKey(email string) string  { return "signup:pending:" + email }
func attemptsKey(email string) string { return "signup:attempts:" + email }
func cooldownKey(email string) string { return "signup:cooldown:" + email }

// NormaliseEmail lower-cases and trims an e-mail the way the database
// compares it (citext).
func NormaliseEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func validEmail(e string) bool {
	if e == "" || len(e) > maxEmailLen || strings.ContainsAny(e, " \t\r\n") {
		return false
	}
	a, err := mail.ParseAddress(e)
	return err == nil && a.Address == e && strings.Contains(e[strings.LastIndex(e, "@"):], ".")
}

func (in StartInput) validate() ValidationError {
	var v ValidationError
	if !validEmail(NormaliseEmail(in.Email)) {
		v = append(v, FieldError{"/email", CodeInvalidEmail})
	}
	if n := utf8.RuneCountInString(in.Password); n < minPasswordRunes || n > maxPasswordRunes {
		v = append(v, FieldError{"/password", CodePasswordTooShort})
	}
	if in.Password != in.PasswordConfirmation {
		v = append(v, FieldError{"/password_confirmation", CodePasswordMismatch})
	}
	if utf8.RuneCountInString(in.Organisation) > maxOrgRunes {
		v = append(v, FieldError{"/organisation", CodeOrgTooLong})
	}
	if !in.RetentionAccepted {
		v = append(v, FieldError{"/retention_accepted", CodeRetentionRequired})
	}
	if !in.TermsAccepted {
		v = append(v, FieldError{"/terms_accepted", CodeTermsRequired})
	}
	return v
}

// claimCooldown reserves the next send. It returns CooldownError while the
// previous code is younger than ResendCooldown.
func (s *Register) claimCooldown(ctx context.Context, email string) error {
	until := s.now().Add(ResendCooldown)
	ok, err := s.cache.SetNX(ctx, cooldownKey(email), []byte(strconv.FormatInt(until.UnixMilli(), 10)), ResendCooldown)
	if err != nil {
		return fmt.Errorf("auth: cooldown: %w", err)
	}
	if ok {
		return nil
	}
	retry := ResendCooldown
	if b, err := s.cache.Get(ctx, cooldownKey(email)); err == nil {
		if ms, perr := strconv.ParseInt(string(b), 10, 64); perr == nil {
			retry = time.UnixMilli(ms).Sub(s.now())
		}
	}
	if retry < time.Second {
		retry = time.Second
	}
	return CooldownError{RetryAfter: retry.Round(time.Second)}
}

// issue creates a code, stores the pending sign-up and e-mails the code. When
// the e-mail cannot be sent nothing stays behind, so the user can retry at
// once.
func (s *Register) issue(ctx context.Context, email string, p pending) (Challenge, error) {
	code, err := NewOTP()
	if err != nil {
		return Challenge{}, err
	}
	if p.OTPSalt, err = NewSalt(); err != nil {
		return Challenge{}, err
	}
	now := s.now()
	p.OTPHash = HashOTP(p.OTPSalt, email, code)
	p.OTPExpiresAt = now.Add(OTPTTL)
	p.CooldownUntil = now.Add(ResendCooldown)
	b, err := json.Marshal(p)
	if err != nil {
		return Challenge{}, err
	}
	if err := s.cache.Set(ctx, pendingKey(email), b, OTPTTL); err != nil {
		return Challenge{}, fmt.Errorf("auth: store pending sign-up: %w", err)
	}
	// A new code starts with a clean attempt counter.
	if err := s.cache.Del(ctx, attemptsKey(email)); err != nil {
		return Challenge{}, fmt.Errorf("auth: reset attempts: %w", err)
	}
	if err := mailer.SendOTP(ctx, s.mail, email, code, int(OTPTTL.Minutes())); err != nil {
		_ = s.cache.Del(context.WithoutCancel(ctx), pendingKey(email), cooldownKey(email))
		return Challenge{}, fmt.Errorf("%w: %v", ErrMailFailed, err)
	}
	return Challenge{ExpiresIn: OTPTTL, ResendIn: ResendCooldown}, nil
}

// Start validates the form, keeps the pending sign-up in Valkey and e-mails a
// code. Nothing is written to Postgres.
func (s *Register) Start(ctx context.Context, in StartInput) (Challenge, error) {
	if v := in.validate(); len(v) > 0 {
		return Challenge{}, v
	}
	email := NormaliseEmail(in.Email)
	taken, err := s.store.EmailTaken(ctx, email)
	if err != nil {
		return Challenge{}, err
	}
	if taken {
		return Challenge{}, ErrEmailTaken
	}
	if err := s.claimCooldown(ctx, email); err != nil {
		return Challenge{}, err
	}
	hash, err := HashPassword(in.Password)
	if err != nil {
		_ = s.cache.Del(context.WithoutCancel(ctx), cooldownKey(email))
		return Challenge{}, err
	}
	ch, err := s.issue(ctx, email, pending{
		PasswordHash: hash, Organisation: strings.TrimSpace(in.Organisation), TermsAt: s.now().UTC(),
	})
	return ch, err
}

func (s *Register) load(ctx context.Context, email string) (pending, error) {
	var p pending
	b, err := s.cache.Get(ctx, pendingKey(email))
	if errors.Is(err, valkey.ErrNotFound) {
		return p, ErrNoPending
	}
	if err != nil {
		return p, fmt.Errorf("auth: load pending sign-up: %w", err)
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return p, fmt.Errorf("auth: decode pending sign-up: %w", err)
	}
	return p, nil
}

// Resend sends a new code for a pending sign-up, at most once per
// ResendCooldown. The old code stops working and the attempt count restarts.
func (s *Register) Resend(ctx context.Context, rawEmail string) (Challenge, error) {
	email := NormaliseEmail(rawEmail)
	if !validEmail(email) {
		return Challenge{}, ValidationError{{"/email", CodeInvalidEmail}}
	}
	p, err := s.load(ctx, email)
	if err != nil {
		return Challenge{}, err
	}
	if err := s.claimCooldown(ctx, email); err != nil {
		return Challenge{}, err
	}
	ch, err := s.issue(ctx, email, p)
	if errors.Is(err, ErrMailFailed) {
		// issue dropped the pending sign-up; put it back for another try.
		if b, merr := json.Marshal(p); merr == nil {
			ttl := p.OTPExpiresAt.Sub(s.now())
			if ttl > 0 {
				_ = s.cache.Set(context.WithoutCancel(ctx), pendingKey(email), b, ttl)
			}
		}
	}
	return ch, err
}

// Verify checks the code and creates the account. It returns ErrOTPInvalid
// for a wrong code, and ErrOTPLocked (dropping the pending sign-up) on the
// wrong code after MaxWrongAttempts others.
func (s *Register) Verify(ctx context.Context, rawEmail, code string) (Account, error) {
	email := NormaliseEmail(rawEmail)
	p, err := s.load(ctx, email)
	if err != nil {
		return Account{}, err
	}
	if !s.now().Before(p.OTPExpiresAt) {
		_ = s.cache.Del(ctx, pendingKey(email), attemptsKey(email))
		return Account{}, ErrOTPExpired
	}
	if !OTPMatches(p.OTPHash, p.OTPSalt, email, code) {
		n, err := s.cache.Incr(ctx, attemptsKey(email), OTPTTL)
		if err != nil {
			return Account{}, fmt.Errorf("auth: count attempts: %w", err)
		}
		if n > MaxWrongAttempts {
			_ = s.cache.Del(ctx, pendingKey(email), attemptsKey(email), cooldownKey(email))
			return Account{}, ErrOTPLocked
		}
		return Account{}, ErrOTPInvalid
	}

	var org *string
	if p.Organisation != "" {
		org = &p.Organisation
	}
	var acc Account
	for range 3 {
		pseud, perr := NewPseudonym()
		if perr != nil {
			return Account{}, perr
		}
		acc, err = s.store.CreateAccount(ctx, NewAccount{
			ID: uuid.New(), Email: email, PasswordHash: p.PasswordHash,
			Organisation: org, Pseudonym: pseud, TermsAcceptedAt: p.TermsAt,
		})
		if !errors.Is(err, errPseudonymUsed) {
			break
		}
	}
	if err != nil {
		if errors.Is(err, ErrEmailTaken) {
			_ = s.cache.Del(ctx, pendingKey(email), attemptsKey(email), cooldownKey(email))
		}
		return Account{}, err
	}
	_ = s.cache.Del(ctx, pendingKey(email), attemptsKey(email), cooldownKey(email))
	return acc, nil
}
