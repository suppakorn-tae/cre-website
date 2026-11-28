package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

type loginFakeStore struct {
	mu   sync.Mutex
	accs map[string]LoginAccount // by e-mail
}

func (f *loginFakeStore) ByEmail(_ context.Context, email string) (LoginAccount, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a, ok := f.accs[email]
	if !ok {
		return LoginAccount{}, ErrLoginNoAccount
	}
	return a, nil
}

func (f *loginFakeStore) SetPasswordHash(_ context.Context, id, hash string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for e, a := range f.accs {
		if a.ID == id && a.Status == loginStatusActive {
			a.PasswordHash = hash
			f.accs[e] = a
			return nil
		}
	}
	return ErrLoginNoAccount
}

type loginFakeSessions struct{ bumped []string }

func (f *loginFakeSessions) Issue(id string, v int, remember bool) (string, time.Time) {
	ttl := 12 * time.Hour
	if remember {
		ttl = 30 * 24 * time.Hour
	}
	return id + ":" + string(rune('0'+v)), time.Now().Add(ttl) //nolint:gosec // G115: small loop counter, no overflow
}

func (f *loginFakeSessions) BumpVersion(_ context.Context, id string) (int, error) {
	f.bumped = append(f.bumped, id)
	return 2, nil
}

// loginMemCache is an in-memory valkey.StateStore. Expiry is not modelled.
type loginMemCache struct {
	mu sync.Mutex
	m  map[string][]byte
	n  map[string]int64
}

func loginNewMemCache() *loginMemCache {
	return &loginMemCache{m: map[string][]byte{}, n: map[string]int64{}}
}

func (c *loginMemCache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
	return nil
}

func (c *loginMemCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	if !ok {
		return nil, valkey.ErrNotFound
	}
	return v, nil
}

func (c *loginMemCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
		delete(c.n, k)
	}
	return nil
}

func (c *loginMemCache) Incr(_ context.Context, k string, _ time.Duration) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n[k]++
	return c.n[k], nil
}

func (c *loginMemCache) SetNX(_ context.Context, k string, v []byte, _ time.Duration) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.m[k]; ok {
		return false, nil
	}
	c.m[k] = v
	return true, nil
}

func loginMustHash(t *testing.T, s string) string {
	t.Helper()
	h, err := HashPassword(s)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestHashRoundTrip(t *testing.T) {
	h := loginMustHash(t, "รหัสผ่านทดสอบ-2569")
	if !VerifyPassword("รหัสผ่านทดสอบ-2569", h) {
		t.Fatal("correct secret rejected")
	}
	if VerifyPassword("wrong", h) || VerifyPassword("x", "not-a-hash") || VerifyPassword("x", "") {
		t.Fatal("wrong secret or bad hash accepted")
	}
}

// The password is checked exactly as typed: no trimming, no case folding and
// no truncation, so a long passphrase counts in full.
func TestPasswordIsCheckedExactly(t *testing.T) {
	const pwd = " Correct Horse รหัสผ่าน "
	h := loginMustHash(t, pwd)
	if !VerifyPassword(pwd, h) {
		t.Fatal("exact password rejected")
	}
	for _, near := range []string{
		strings.TrimSpace(pwd), strings.ToLower(pwd), strings.ToUpper(pwd), pwd[:len(pwd)-1],
	} {
		if VerifyPassword(near, h) {
			t.Errorf("altered password %q accepted", near)
		}
	}
	long := strings.Repeat("ก", 127) + "a" // 128 runes, well past bcrypt's 72 bytes
	hl := loginMustHash(t, long)
	if VerifyPassword(strings.Repeat("ก", 127)+"b", hl) {
		t.Error("only a prefix of a long password is checked")
	}
}

func loginNewEnv(t *testing.T) (*LoginService, *loginFakeStore) {
	t.Helper()
	st := &loginFakeStore{accs: map[string]LoginAccount{
		"a@example.com":   {ID: "a", PasswordHash: loginMustHash(t, "correct-horse"), Status: "active", Version: 1},
		"off@example.com": {ID: "off", PasswordHash: loginMustHash(t, "correct-horse"), Status: "deactivated", Version: 1},
		"g@example.com":   {ID: "g", HasGoogle: true, Status: "active", Version: 1},
	}}
	s, err := NewLoginService(st, &loginFakeSessions{})
	if err != nil {
		t.Fatal(err)
	}
	return s, st
}

func TestLogin(t *testing.T) {
	s, _ := loginNewEnv(t)
	ctx := context.Background()

	res, err := s.Login(ctx, "  A@Example.com ", "correct-horse", false)
	if err != nil || res.AccountID != "a" || res.Remember {
		t.Fatalf("login = %+v, %v", res, err)
	}
	if d := time.Until(res.Expires); d > 13*time.Hour || d < 11*time.Hour {
		t.Errorf("session ttl = %v, want about 12h", d)
	}
	res, err = s.Login(ctx, "a@example.com", "correct-horse", true)
	if err != nil || !res.Remember {
		t.Fatalf("keep = %+v, %v", res, err)
	}
	if d := time.Until(res.Expires); d < 29*24*time.Hour {
		t.Errorf("remember ttl = %v, want about 30d", d)
	}

	for name, c := range map[string][2]string{
		"wrong password": {"a@example.com", "nope"},
		"unknown e-mail": {"zzz@example.com", "correct-horse"},
		"google only":    {"g@example.com", "correct-horse"},
		"off, wrong pw":  {"off@example.com", "nope"},
	} {
		if _, err := s.Login(ctx, c[0], c[1], false); !errors.Is(err, ErrInvalidCredentials) {
			t.Errorf("%s: err = %v, want ErrInvalidCredentials", name, err)
		}
	}
	if _, err := s.Login(ctx, "off@example.com", "correct-horse", false); !errors.Is(err, ErrAccountUnavailable) {
		t.Errorf("deactivated: err = %v, want ErrAccountUnavailable", err)
	}
}

// Wrong password and unknown e-mail both run one Argon2id verification, so
// their timings stay in the same range.
func TestLoginTimingSimilar(t *testing.T) {
	s, _ := loginNewEnv(t)
	ctx := context.Background()
	avg := func(email string) time.Duration {
		start := time.Now()
		for range 5 {
			_, _ = s.Login(ctx, email, "wrong-password", false)
		}
		return time.Since(start) / 5
	}
	wrong, unknown := avg("a@example.com"), avg("nobody@example.com")
	lo, hi := min(wrong, unknown), max(wrong, unknown)
	if hi > 3*lo {
		t.Errorf("timing differs: wrong password %v, unknown e-mail %v", wrong, unknown)
	}
}
