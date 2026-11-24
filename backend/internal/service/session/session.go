// Package session issues and checks login sessions.
//
// The cookie holds a signed token (HS256 JWT) that only names the account and
// the session version it was issued for. On every request the service loads
// the account record (Valkey cache, Postgres on miss) and rejects the token
// when the account is not active or the version differs. Role is read from
// the record, never from the token.
package session

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// CookieName is the session cookie.
const CookieName = "cre_session"

// Roles and statuses as stored in the account table.
const (
	RoleUser  = "user"
	RoleAdmin = "admin"

	StatusActive      = "active"
	StatusDeactivated = "deactivated"
	StatusDeleted     = "deleted"
)

// Errors returned by Authenticate. All of them mean HTTP 401.
var (
	ErrInvalidToken = errors.New("session: invalid token")
	ErrExpired      = errors.New("session: token expired")
	ErrRevoked      = errors.New("session: session ended")
	// ErrNoAccount is returned by a Store when the account does not exist.
	ErrNoAccount = errors.New("session: account not found")
)

// Record is what the server knows about an account.
type Record struct {
	Role    string `json:"role"`
	Status  string `json:"status"`
	Version int    `json:"version"`
}

// Profile is the account data GET /auth/me returns.
type Profile struct {
	ID              string
	Email           string
	Organisation    *string
	Role            string
	HasPassword     bool
	HasGoogle       bool
	TermsAcceptedAt time.Time
	CreatedAt       time.Time
}

// Store reads and bumps the account record in Postgres.
type Store interface {
	// GetRecord returns ErrNoAccount when the id is unknown.
	GetRecord(ctx context.Context, accountID string) (Record, error)
	// BumpVersion adds one to the session version and returns the new value.
	BumpVersion(ctx context.Context, accountID string) (int, error)
	// GetProfile returns ErrNoAccount when the id is unknown.
	GetProfile(ctx context.Context, accountID string) (Profile, error)
}

// Config sets lifetimes and cookie flags.
type Config struct {
	Secret      []byte        // HMAC key, at least 32 bytes
	SessionTTL  time.Duration // SESSION_TTL, default 12h
	RememberTTL time.Duration // REMEMBER_TTL, default 30d
	CacheTTL    time.Duration // record cache lifetime, default 30s
	Insecure    bool          // drop the Secure flag (local http only)
}

// Principal is the authenticated caller of a request.
type Principal struct {
	AccountID string
	Role      string
	// Expires is when the token ends; Remember is true for a REMEMBER_TTL
	// token.
	Expires  time.Time
	Remember bool
}

// Service checks and manages sessions.
type Service struct {
	cfg   Config
	store Store
	cache valkey.StateStore
	now   func() time.Time
}

// New builds a Service. It rejects a short secret.
func New(cfg Config, store Store, cache valkey.StateStore) (*Service, error) {
	if len(cfg.Secret) < 32 {
		return nil, errors.New("session: secret must be at least 32 bytes")
	}
	if cfg.SessionTTL <= 0 {
		cfg.SessionTTL = 12 * time.Hour
	}
	if cfg.RememberTTL <= 0 {
		cfg.RememberTTL = 30 * 24 * time.Hour
	}
	if cfg.CacheTTL <= 0 {
		cfg.CacheTTL = 30 * time.Second
	}
	return &Service{cfg: cfg, store: store, cache: cache, now: time.Now}, nil
}

type claims struct {
	Sub string `json:"sub"`
	Ver int    `json:"ver"`
	Exp int64  `json:"exp"`
	Rem bool   `json:"rem,omitempty"`
}

var header = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

func (s *Service) sign(payload string) string {
	m := hmac.New(sha256.New, s.cfg.Secret)
	m.Write([]byte(header + "." + payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// Issue returns a signed token for the account at its current version and the
// time it expires.
func (s *Service) Issue(accountID string, version int, remember bool) (string, time.Time) {
	ttl := s.cfg.SessionTTL
	if remember {
		ttl = s.cfg.RememberTTL
	}
	exp := s.now().Add(ttl).Truncate(time.Second)
	b, _ := json.Marshal(claims{Sub: accountID, Ver: version, Exp: exp.Unix(), Rem: remember})
	p := base64.RawURLEncoding.EncodeToString(b)
	return header + "." + p + "." + s.sign(p), exp
}

func (s *Service) parse(token string) (claims, error) {
	var c claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != header {
		return c, ErrInvalidToken
	}
	if !hmac.Equal([]byte(parts[2]), []byte(s.sign(parts[1]))) {
		return c, ErrInvalidToken
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(b, &c) != nil || c.Sub == "" {
		return c, ErrInvalidToken
	}
	if s.now().Unix() >= c.Exp {
		return c, ErrExpired
	}
	return c, nil
}

func cacheKey(id string) string { return "session:acct:" + id }

// floorKey holds the lowest session version that may still be served from
// the cache, set by BumpVersion.
func floorKey(id string) string { return "session:floor:" + id }

// floor returns the version floor for the account, 0 when none is set. A
// cache failure other than a miss returns an error so the caller reads
// Postgres.
func (s *Service) floor(ctx context.Context, id string) (int, error) {
	b, err := s.cache.Get(ctx, floorKey(id))
	if errors.Is(err, valkey.ErrNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(string(b))
}

// record loads the account record, from the cache when it is there and not
// older than the version floor.
func (s *Service) record(ctx context.Context, id string) (Record, error) {
	if b, err := s.cache.Get(ctx, cacheKey(id)); err == nil {
		var r Record
		if json.Unmarshal(b, &r) == nil {
			// A reader that loaded the row just before a bump may write the
			// old record after BumpVersion dropped the entry. The floor
			// outlives any such write, so a stale entry is never served.
			if f, ferr := s.floor(ctx, id); ferr == nil && r.Version >= f {
				return r, nil
			}
		}
	}
	r, err := s.store.GetRecord(ctx, id)
	if err != nil {
		return Record{}, err
	}
	if b, err := json.Marshal(r); err == nil {
		// A cache failure only costs a database read next time.
		_ = s.cache.Set(ctx, cacheKey(id), b, s.cfg.CacheTTL)
	}
	return r, nil
}

// Authenticate checks the token and the account record. A 401 reason is one
// of the Err values; any other error is an infrastructure failure (HTTP 500).
func (s *Service) Authenticate(ctx context.Context, token string) (Principal, error) {
	c, err := s.parse(token)
	if err != nil {
		return Principal{}, err
	}
	r, err := s.record(ctx, c.Sub)
	if errors.Is(err, ErrNoAccount) {
		return Principal{}, ErrRevoked
	}
	if err != nil {
		return Principal{}, fmt.Errorf("session: load account: %w", err)
	}
	if r.Status != StatusActive || r.Version != c.Ver {
		return Principal{}, ErrRevoked
	}
	return Principal{
		AccountID: c.Sub, Role: r.Role,
		Expires: time.Unix(c.Exp, 0), Remember: c.Rem,
	}, nil
}

// BumpVersion ends every session of the account: old tokens get 401 at once
// on every replica, because the shared cache entry is dropped.
func (s *Service) BumpVersion(ctx context.Context, accountID string) (int, error) {
	v, err := s.store.BumpVersion(ctx, accountID)
	if err != nil {
		return 0, err
	}
	// Set the floor before the delete: a cache write that races with this
	// bump may land after the delete, but it then holds a version below the
	// floor and record() ignores it. The floor lives longer than any cache
	// entry written before this point.
	if err := s.cache.Set(ctx, floorKey(accountID), []byte(strconv.Itoa(v)), 2*s.cfg.CacheTTL); err != nil {
		return v, fmt.Errorf("session: set version floor: %w", err)
	}
	if err := s.cache.Del(ctx, cacheKey(accountID)); err != nil {
		return v, fmt.Errorf("session: drop cache: %w", err)
	}
	return v, nil
}

// Profile returns the account data for GET /auth/me.
func (s *Service) Profile(ctx context.Context, accountID string) (Profile, error) {
	return s.store.GetProfile(ctx, accountID)
}

// Forget drops the cached record, for status or role changes.
func (s *Service) Forget(ctx context.Context, accountID string) error {
	return s.cache.Del(ctx, cacheKey(accountID))
}

// SetCookie writes the session cookie. A remembered session persists until
// exp; otherwise the cookie ends with the browser session.
func (s *Service) SetCookie(w http.ResponseWriter, token string, exp time.Time, remember bool) {
	c := &http.Cookie{
		Name: CookieName, Value: token, Path: "/",
		HttpOnly: true, Secure: !s.cfg.Insecure, SameSite: http.SameSiteLaxMode,
	}
	if remember {
		c.Expires = exp
		c.MaxAge = int(exp.Sub(s.now()).Seconds())
	}
	http.SetCookie(w, c)
}

// ClearCookie removes the session cookie (log out of this device).
func (s *Service) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: !s.cfg.Insecure, SameSite: http.SameSiteLaxMode,
	})
}
