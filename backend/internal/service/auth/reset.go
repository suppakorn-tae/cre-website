package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
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
	dummy    string
	// Async runs the e-mail send off the request path, so a known and an
	// unknown address answer in the same time. Tests set it to run inline.
	Async func(func())
}

// NewResetService builds the service. mail may be nil: the code is then
// stored but not sent, and an error is logged.
func NewResetService(store LoginStore, sessions LoginSessions, cache valkey.StateStore, mail mailer.Mailer, log *slog.Logger) (*ResetService, error) {
	dummy, err := loginHashSecret("dummy-otp-for-timing")
	if err != nil {
		return nil, err
	}
	if log == nil {
		log = slog.Default()
	}
	return &ResetService{
		store: store, sessions: sessions, cache: cache, mail: mail, log: log, dummy: dummy,
		Async: func(f func()) { go f() },
	}, nil
}

type resetCode struct {
	Hash  string `json:"hash"`
	Nonce string `json:"nonce"`
}

func resetCodeKey(email string) string     { return "otp:reset:" + email }
func resetCooldownKey(email string) string { return "otp:reset:cd:" + email }
func resetAttemptsKey(email, nonce string) string {
	return "otp:reset:att:" + email + ":" + nonce
}

func resetNewCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// RequestCode starts a reset. The answer is the same whether or not the
// e-mail is registered, and the cool-down applies to every e-mail. Only an
// active account with a password gets a code.
func (s *ResetService) RequestCode(ctx context.Context, email string) (ResetChallenge, error) {
	email = loginNormaliseEmail(email)
	ch := ResetChallenge{ExpiresIn: ResetOTPTTL, ResendIn: ResetResendAfter}
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
	code, err := resetNewCode()
	if err != nil {
		return ch, fmt.Errorf("auth: generate code: %w", err)
	}
	// Hash on every path so timing does not reveal the account.
	hash, err := loginHashSecret(code)
	if err != nil {
		return ch, err
	}
	if !eligible {
		return ch, nil
	}
	nonce := make([]byte, 8)
	if _, err := rand.Read(nonce); err != nil {
		return ch, err
	}
	b, _ := json.Marshal(resetCode{Hash: hash, Nonce: hex.EncodeToString(nonce)})
	if err := s.cache.Set(ctx, resetCodeKey(email), b, ResetOTPTTL); err != nil {
		return ch, fmt.Errorf("auth: store code: %w", err)
	}
	s.Async(func() {
		c, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		if s.mail == nil {
			s.log.Error("password reset code not sent: no mailer configured")
			return
		}
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
	email = loginNormaliseEmail(email)
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
		loginVerifySecret(otp, s.dummy) // same cost as a real check
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
	if !loginVerifySecret(otp, rc.Hash) {
		return ErrResetOTPInvalid
	}
	acc, err := s.store.ByEmail(ctx, email)
	if errors.Is(err, ErrLoginNoAccount) || (err == nil && acc.Status != loginStatusActive) {
		_ = s.cache.Del(ctx, resetCodeKey(email))
		return ErrResetOTPExpired
	}
	if err != nil {
		return fmt.Errorf("auth: load account: %w", err)
	}
	hash, err := loginHashSecret(newPassword)
	if err != nil {
		return err
	}
	if err := s.store.SetPasswordHash(ctx, acc.ID, hash); err != nil {
		return fmt.Errorf("auth: store password: %w", err)
	}
	if _, err := s.sessions.BumpVersion(ctx, acc.ID); err != nil {
		return fmt.Errorf("auth: end sessions: %w", err)
	}
	_ = s.cache.Del(ctx, resetCodeKey(email), resetAttemptsKey(email, rc.Nonce))
	return nil
}
