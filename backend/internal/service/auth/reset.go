package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"
	"unicode/utf8"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// OTP rules (BR-16): 6 digits, 10 minutes, 5 wrong attempts, resend per 60 s.
const (
	ResetOTPTTL      = 10 * time.Minute
	ResetResendAfter = 60 * time.Second
	resetMaxAttempts = 5

	// ResetMinPassword and ResetMaxPassword bound a new password in
	// characters (BR-22).
	ResetMinPassword = 8
	ResetMaxPassword = 128
)

// Errors returned by the reset service.
var (
	// ErrResetCooldown: a code was requested less than 60 s ago (HTTP 429).
	ErrResetCooldown = errors.New("auth: otp resend cool-down")
	// ErrResetMailUnavailable: no mailer is configured (HTTP 503, for every
	// e-mail, so it reveals nothing about an account).
	ErrResetMailUnavailable = errors.New("auth: mail not configured")
	// ErrResetOTPInvalid: wrong code (HTTP 422, /otp).
	ErrResetOTPInvalid = errors.New("auth: otp invalid")
	// ErrResetOTPExpired: older than 10 minutes or never issued.
	ErrResetOTPExpired = errors.New("auth: otp expired")
	// ErrResetOTPLocked: more than 5 wrong attempts, code invalidated.
	ErrResetOTPLocked = errors.New("auth: otp locked")
	// ErrResetPasswordShort and ErrResetPasswordMismatch are field errors.
	ErrResetPasswordShort    = errors.New("auth: password too short")
	ErrResetPasswordMismatch = errors.New("auth: password mismatch")
)

// ResetChallenge is what the client learns after requesting a code.
type ResetChallenge struct {
	ExpiresIn, ResendIn time.Duration
}

// ResetService sends reset codes and sets new passwords.
type ResetService struct {
	store    LoginStore
	sessions LoginSessions
	cache    valkey.StateStore
	mail     mailer.Mailer
	log      *slog.Logger
	// Async runs the e-mail send off the request path, so a known and an
	// unknown address answer in the same time. Tests set it to run inline.
	Async func(func())
}

// NewResetService builds the service. mail may be nil: RequestCode then
// answers ErrResetMailUnavailable. A send failure for a real account is only
// logged, so the answer does not tell registered e-mails apart.
func NewResetService(store LoginStore, sessions LoginSessions, cache valkey.StateStore, mail mailer.Mailer, log *slog.Logger) (*ResetService, error) {
	if log == nil {
		log = slog.Default()
	}
	return &ResetService{
		store: store, sessions: sessions, cache: cache, mail: mail, log: log,
		Async: func(f func()) { go f() },
	}, nil
}

type resetCode struct {
	Salt  []byte `json:"salt"`
	Hash  []byte `json:"hash"`
	Nonce string `json:"nonce"`
}

func resetCodeKey(email string) string     { return "otp:reset:" + email }
func resetCooldownKey(email string) string { return "otp:reset:cd:" + email }
func resetUsedKey(email, nonce string) string {
	return "otp:reset:used:" + email + ":" + nonce
}

func resetAttemptsKey(email, nonce string) string {
	return "otp:reset:att:" + email + ":" + nonce
}

// RequestCode starts a reset. The answer is the same whether or not the
// e-mail is registered, and the cool-down applies to every e-mail. Only an
// active account with a password gets a code.
func (s *ResetService) RequestCode(ctx context.Context, email string) (ResetChallenge, error) {
	email = NormaliseEmail(email)
	ch := ResetChallenge{ExpiresIn: ResetOTPTTL, ResendIn: ResetResendAfter}
	if s.mail == nil {
		return ch, ErrResetMailUnavailable
	}
	fresh, err := s.cache.SetNX(ctx, resetCooldownKey(email), []byte("1"), ResetResendAfter)
	if err != nil {
		return ch, fmt.Errorf("auth: cool-down: %w", err)
	}
	if !fresh {
		return ch, ErrResetCooldown
	}
	acc, err := s.store.ByEmail(ctx, email)
	eligible := err == nil && acc.Status == loginStatusActive && acc.PasswordHash != ""
	if err != nil && !errors.Is(err, ErrLoginNoAccount) {
		return ch, fmt.Errorf("auth: load account: %w", err)
	}
	code, err := NewOTP()
	if err != nil {
		return ch, fmt.Errorf("auth: generate code: %w", err)
	}
	if !eligible {
		return ch, nil
	}
	salt, err := NewSalt()
	if err != nil {
		return ch, err
	}
	nonce := make([]byte, 8)
	if _, err := rand.Read(nonce); err != nil {
		return ch, err
	}
	b, _ := json.Marshal(resetCode{Salt: salt, Hash: HashOTP(salt, email, code), Nonce: hex.EncodeToString(nonce)})
	if err := s.cache.Set(ctx, resetCodeKey(email), b, ResetOTPTTL); err != nil {
		return ch, fmt.Errorf("auth: store code: %w", err)
	}
	s.Async(func() {
		c, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		if err := mailer.SendOTP(c, s.mail, email, code, int(ResetOTPTTL.Minutes())); err != nil {
			s.log.Error("password reset e-mail failed", "error", err)
		}
	})
	return ch, nil
}

// ResetValidatePassword checks a new password and its confirmation.
func ResetValidatePassword(newPassword, confirmation string) error {
	if n := utf8.RuneCountInString(newPassword); n < ResetMinPassword || n > ResetMaxPassword {
		return ErrResetPasswordShort
	}
	if newPassword != confirmation {
		return ErrResetPasswordMismatch
	}
	return nil
}

// Reset checks the code and stores the new password. On success every
// session of the account ends (session version bump) and the code is spent.
func (s *ResetService) Reset(ctx context.Context, email, otp, newPassword, confirmation string) error {
	email = NormaliseEmail(email)
	if err := ResetValidatePassword(newPassword, confirmation); err != nil {
		return err
	}
	raw, err := s.cache.Get(ctx, resetCodeKey(email))
	var rc resetCode
	missing := errors.Is(err, valkey.ErrNotFound)
	if err != nil && !missing {
		return fmt.Errorf("auth: load code: %w", err)
	}
	if !missing && json.Unmarshal(raw, &rc) != nil {
		missing = true
	}
	if missing {
		return ErrResetOTPExpired
	}
	n, err := s.cache.Incr(ctx, resetAttemptsKey(email, rc.Nonce), ResetOTPTTL)
	if err != nil {
		return fmt.Errorf("auth: count attempt: %w", err)
	}
	if n > resetMaxAttempts {
		_ = s.cache.Del(ctx, resetCodeKey(email))
		return ErrResetOTPLocked
	}
	if !OTPMatches(rc.Hash, rc.Salt, email, otp) {
		return ErrResetOTPInvalid
	}
	// Consume the code atomically: of two concurrent requests with the same
	// valid code only the one that wins this SetNX goes on.
	won, err := s.cache.SetNX(ctx, resetUsedKey(email, rc.Nonce), []byte("1"), ResetOTPTTL)
	if err != nil {
		return fmt.Errorf("auth: consume code: %w", err)
	}
	if !won {
		return ErrResetOTPExpired
	}
	acc, err := s.store.ByEmail(ctx, email)
	if errors.Is(err, ErrLoginNoAccount) || (err == nil && acc.Status != loginStatusActive) {
		_ = s.cache.Del(ctx, resetCodeKey(email))
		return ErrResetOTPExpired
	}
	if err != nil {
		_ = s.cache.Del(ctx, resetUsedKey(email, rc.Nonce)) // not spent: allow a retry
		return fmt.Errorf("auth: load account: %w", err)
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		_ = s.cache.Del(ctx, resetUsedKey(email, rc.Nonce))
		return err
	}
	if err := s.store.SetPasswordHash(ctx, acc.ID, hash); err != nil {
		_ = s.cache.Del(ctx, resetUsedKey(email, rc.Nonce))
		return fmt.Errorf("auth: store password: %w", err)
	}
	if _, err := s.sessions.BumpVersion(ctx, acc.ID); err != nil {
		return fmt.Errorf("auth: end sessions: %w", err)
	}
	_ = s.cache.Del(ctx, resetCodeKey(email), resetAttemptsKey(email, rc.Nonce))
	return nil
}
