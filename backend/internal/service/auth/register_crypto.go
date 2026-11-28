package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP minimum profile: 19 MiB, 2 passes, 1 lane).
const (
	argonMemoryKiB = 19 * 1024
	argonTime      = 2
	argonThreads   = 1
	argonKeyLen    = 32
	argonSaltLen   = 16
)

// HashPassword returns the Argon2id hash of password in the PHC string form
// ($argon2id$v=19$m=...,t=...,p=...$salt$hash). The log-in and password-reset
// services reuse it together with VerifyPassword.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version,
		argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether password matches a hash made by
// HashPassword. A malformed hash never matches.
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	var mem, t uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &t, &threads); err != nil {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[4])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil || len(want) == 0 || len(want) > 1<<10 || mem > 1<<20 || t == 0 || t > 10 || threads == 0 {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, t, mem, threads, uint32(len(want))) //nolint:gosec // len(want) is checked above to be at most 1024
	return subtle.ConstantTimeCompare(got, want) == 1
}

// otpDigits is the length of an OTP (BR-16).
const otpDigits = 6

var otpMax = big.NewInt(1_000_000)

// NewOTP returns a uniformly random 6-digit code, zero padded. Sign-up and
// password reset both use it.
func NewOTP() (string, error) {
	n, err := rand.Int(rand.Reader, otpMax)
	if err != nil {
		return "", fmt.Errorf("auth: otp: %w", err)
	}
	return fmt.Sprintf("%0*d", otpDigits, n.Int64()), nil
}

// NewSalt returns random bytes used to salt a stored OTP hash.
func NewSalt() ([]byte, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("auth: salt: %w", err)
	}
	return b, nil
}

// HashOTP is the stored form of an OTP: SHA-256 over the salt, the e-mail and
// the code. The code space is small, so the hash only keeps the code out of
// plain sight; the five-attempt limit is what stops guessing.
func HashOTP(salt []byte, email, code string) []byte {
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte{0})
	h.Write([]byte(email))
	h.Write([]byte{0})
	h.Write([]byte(code))
	return h.Sum(nil)
}

// OTPMatches compares a submitted code with a stored hash in constant time.
func OTPMatches(stored, salt []byte, email, code string) bool {
	return subtle.ConstantTimeCompare(stored, HashOTP(salt, email, code)) == 1
}

var pseudonymEnc = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewPseudonym returns a random account pseudonym (not derived from the
// e-mail), for example "p-3kq7xw2m9fh4nb8d".
func NewPseudonym() (string, error) {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", errors.New("auth: pseudonym: " + err.Error())
	}
	return "p-" + strings.ToLower(pseudonymEnc.EncodeToString(b)), nil
}
