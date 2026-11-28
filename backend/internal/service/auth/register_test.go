package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *clock) add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// memCache is an in-memory valkey.StateStore with TTLs on a fake clock.
type memCache struct {
	clk *clock
	mu  sync.Mutex
	m   map[string]memEntry
}

type memEntry struct {
	v   []byte
	exp time.Time
}

func newMem(c *clock) *memCache { return &memCache{clk: c, m: map[string]memEntry{}} }

func (c *memCache) live(k string) (memEntry, bool) {
	e, ok := c.m[k]
	if ok && !c.clk.now().Before(e.exp) {
		delete(c.m, k)
		return memEntry{}, false
	}
	return e, ok
}

func (c *memCache) Set(_ context.Context, k string, v []byte, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = memEntry{v, c.clk.now().Add(ttl)}
	return nil
}

func (c *memCache) Get(_ context.Context, k string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.live(k); ok {
		return e.v, nil
	}
	return nil, valkey.ErrNotFound
}

func (c *memCache) Del(_ context.Context, ks ...string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, k := range ks {
		delete(c.m, k)
	}
	return nil
}

func (c *memCache) Incr(_ context.Context, k string, ttl time.Duration) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.live(k)
	n := int64(1)
	if ok {
		n = int64(len(e.v)) + 1 // value is n bytes long
	} else {
		e.exp = c.clk.now().Add(ttl)
	}
	c.m[k] = memEntry{make([]byte, n), e.exp}
	return n, nil
}

func (c *memCache) SetNX(_ context.Context, k string, v []byte, ttl time.Duration) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.live(k); ok {
		return false, nil
	}
	c.m[k] = memEntry{v, c.clk.now().Add(ttl)}
	return true, nil
}

type memStore struct {
	emails   map[string]bool
	accounts []NewAccount
	pseudErr int // number of pseudonym collisions to simulate
}

func (s *memStore) EmailTaken(_ context.Context, e string) (bool, error) { return s.emails[e], nil }
func (s *memStore) CreateAccount(_ context.Context, a NewAccount) (Account, error) {
	if s.emails[a.Email] {
		return Account{}, ErrEmailTaken
	}
	if s.pseudErr > 0 {
		s.pseudErr--
		return Account{}, errPseudonymUsed
	}
	s.emails[a.Email] = true
	s.accounts = append(s.accounts, a)
	return Account{ID: a.ID, Email: a.Email, SessionVersion: 1, TermsAcceptedAt: a.TermsAcceptedAt}, nil
}

type env struct {
	svc   *Register
	clk   *clock
	cache *memCache
	store *memStore
	mail  *mailer.Fake
}

func newEnv() env {
	clk := &clock{t: time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)}
	e := env{clk: clk, cache: newMem(clk), store: &memStore{emails: map[string]bool{}}, mail: &mailer.Fake{}}
	e.svc = NewRegister(e.store, e.cache, e.mail)
	e.svc.now = clk.now
	return e
}

func goodForm() StartInput {
	return StartInput{ //nolint:gosec // G101: test fixture, not a real credential
		Email: "Somchai.K@Example.co.th ", Password: "รหัสผ่านทดสอบ-2569", PasswordConfirmation: "รหัสผ่านทดสอบ-2569",
		Organisation: "บริษัท สยามก่อสร้าง จำกัด", RetentionAccepted: true, TermsAccepted: true,
	}
}

var codeRe = regexp.MustCompile(`\b\d{6}\b`)

func (e env) lastCode(t *testing.T) string {
	t.Helper()
	s := e.mail.Sent()
	if len(s) == 0 {
		t.Fatal("no e-mail sent")
	}
	c := codeRe.FindString(s[len(s)-1].Body)
	if c == "" {
		t.Fatalf("no code in %q", s[len(s)-1].Body)
	}
	return c
}

func wrongCode(good string) string {
	if good == "000000" {
		return "111111"
	}
	return "000000"
}

const mail1 = "somchai.k@example.co.th"

func TestStartValidation(t *testing.T) {
	cases := map[string]struct {
		mod  func(*StartInput)
		want []FieldError
	}{
		"bad email":      {func(i *StartInput) { i.Email = "nope" }, []FieldError{{"/email", CodeInvalidEmail}}},
		"short password": {func(i *StartInput) { i.Password, i.PasswordConfirmation = "short", "short" }, []FieldError{{"/password", CodePasswordTooShort}}},
		"mismatch":       {func(i *StartInput) { i.PasswordConfirmation = "different-pass" }, []FieldError{{"/password_confirmation", CodePasswordMismatch}}},
		"no retention":   {func(i *StartInput) { i.RetentionAccepted = false }, []FieldError{{"/retention_accepted", CodeRetentionRequired}}},
		"no terms":       {func(i *StartInput) { i.TermsAccepted = false }, []FieldError{{"/terms_accepted", CodeTermsRequired}}},
		"long org":       {func(i *StartInput) { i.Organisation = strings.Repeat("ก", 201) }, []FieldError{{"/organisation", CodeOrgTooLong}}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			e := newEnv()
			in := goodForm()
			c.mod(&in)
			_, err := e.svc.Start(context.Background(), in)
			var v ValidationError
			if !errors.As(err, &v) || len(v) != len(c.want) || v[0] != c.want[0] {
				t.Fatalf("got %v, want %v", err, c.want)
			}
			if len(e.mail.Sent()) != 0 {
				t.Fatal("e-mail sent for invalid form")
			}
		})
	}
}

func TestStartThenVerifyCreatesAccountOnlyAfterOTP(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	ch, err := e.svc.Start(ctx, goodForm())
	if err != nil || ch.ExpiresIn != 10*time.Minute || ch.ResendIn != 60*time.Second {
		t.Fatalf("start: %+v %v", ch, err)
	}
	if len(e.store.accounts) != 0 {
		t.Fatal("account exists before OTP verification")
	}
	m := e.mail.Sent()[0]
	if m.To != mail1 {
		t.Fatalf("sent to %q", m.To)
	}
	// The pending record holds a hash of the code and of the password only.
	raw, _ := e.cache.Get(ctx, pendingKey(mail1))
	if strings.Contains(string(raw), `"`+e.lastCode(t)+`"`) {
		t.Fatal("code stored in clear")
	}
	if strings.Contains(string(raw), "รหัสผ่าน") {
		t.Fatal("password stored in clear")
	}
	acc, err := e.svc.Verify(ctx, " "+strings.ToUpper(mail1), e.lastCode(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(e.store.accounts) != 1 || acc.Email != mail1 {
		t.Fatalf("accounts: %+v", e.store.accounts)
	}
	a := e.store.accounts[0]
	if !strings.HasPrefix(a.PasswordHash, "$argon2id$") || !VerifyPassword("รหัสผ่านทดสอบ-2569", a.PasswordHash) {
		t.Fatalf("hash: %q", a.PasswordHash)
	}
	if !strings.HasPrefix(a.Pseudonym, "p-") || strings.Contains(a.Pseudonym, "somchai") {
		t.Fatalf("pseudonym: %q", a.Pseudonym)
	}
	if a.Organisation == nil || *a.Organisation != "บริษัท สยามก่อสร้าง จำกัด" || a.TermsAcceptedAt.IsZero() {
		t.Fatalf("account: %+v", a)
	}
	// The pending sign-up is gone.
	if _, err := e.svc.Verify(ctx, mail1, "123456"); !errors.Is(err, ErrNoPending) {
		t.Fatalf("second verify: %v", err)
	}
}

func TestExistingEmailIsRejected(t *testing.T) {
	e := newEnv()
	e.store.emails[mail1] = true
	if _, err := e.svc.Start(context.Background(), goodForm()); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("got %v", err)
	}
	if len(e.mail.Sent()) != 0 {
		t.Fatal("e-mail sent for a registered address")
	}
}

func TestSixthWrongCodeInvalidatesPendingSignup(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	if _, err := e.svc.Start(ctx, goodForm()); err != nil {
		t.Fatal(err)
	}
	good := e.lastCode(t)
	bad := wrongCode(good)
	for i := 1; i <= MaxWrongAttempts; i++ {
		if _, err := e.svc.Verify(ctx, mail1, bad); !errors.Is(err, ErrOTPInvalid) {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
	if _, err := e.svc.Verify(ctx, mail1, bad); !errors.Is(err, ErrOTPLocked) {
		t.Fatalf("sixth wrong code: %v", err)
	}
	// Even the right code no longer works.
	if _, err := e.svc.Verify(ctx, mail1, good); !errors.Is(err, ErrNoPending) {
		t.Fatalf("after lock: %v", err)
	}
	if len(e.store.accounts) != 0 {
		t.Fatal("account created")
	}
}

func TestRightCodeStillWorksAfterFiveWrongOnes(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	_, _ = e.svc.Start(ctx, goodForm())
	good := e.lastCode(t)
	for range MaxWrongAttempts {
		_, _ = e.svc.Verify(ctx, mail1, wrongCode(good))
	}
	if _, err := e.svc.Verify(ctx, mail1, good); err != nil {
		t.Fatalf("got %v", err)
	}
}

func TestCodeExpiresAfterTenMinutes(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	_, _ = e.svc.Start(ctx, goodForm())
	code := e.lastCode(t)
	e.clk.add(OTPTTL + time.Second)
	if _, err := e.svc.Verify(ctx, mail1, code); !errors.Is(err, ErrNoPending) && !errors.Is(err, ErrOTPExpired) {
		t.Fatalf("got %v", err)
	}
	if len(e.store.accounts) != 0 {
		t.Fatal("account created with expired code")
	}
}

func TestResendCooldownAndReset(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	if _, err := e.svc.Start(ctx, goodForm()); err != nil {
		t.Fatal(err)
	}
	first := e.lastCode(t)

	// Start again or resend inside 60 s: cool-down with the wait left.
	e.clk.add(20 * time.Second)
	var cd CooldownError
	if _, err := e.svc.Resend(ctx, mail1); !errors.As(err, &cd) || cd.RetryAfter != 40*time.Second {
		t.Fatalf("resend: %v", err)
	}
	if _, err := e.svc.Start(ctx, goodForm()); !errors.As(err, &cd) {
		t.Fatalf("start again: %v", err)
	}
	if len(e.mail.Sent()) != 1 {
		t.Fatalf("sent %d e-mails", len(e.mail.Sent()))
	}

	// Burn four attempts, then resend: counter resets, old code is dead.
	for range 4 {
		_, _ = e.svc.Verify(ctx, mail1, wrongCode(first))
	}
	e.clk.add(41 * time.Second)
	if _, err := e.svc.Resend(ctx, mail1); err != nil {
		t.Fatal(err)
	}
	second := e.lastCode(t)
	if second != first {
		if _, err := e.svc.Verify(ctx, mail1, first); !errors.Is(err, ErrOTPInvalid) {
			t.Fatalf("old code: %v", err)
		}
	}
	for range MaxWrongAttempts - 1 { // one already spent on the old code
		if _, err := e.svc.Verify(ctx, mail1, wrongCode(second)); !errors.Is(err, ErrOTPInvalid) {
			t.Fatalf("counter was not reset: %v", err)
		}
	}
	if _, err := e.svc.Verify(ctx, mail1, second); err != nil {
		t.Fatal(err)
	}
}

func TestResendWithoutPending(t *testing.T) {
	e := newEnv()
	if _, err := e.svc.Resend(context.Background(), mail1); !errors.Is(err, ErrNoPending) {
		t.Fatalf("got %v", err)
	}
}

func TestMailFailureLeavesNothingBehind(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	e.mail.Err = errors.New("smtp down")
	if _, err := e.svc.Start(ctx, goodForm()); !errors.Is(err, ErrMailFailed) {
		t.Fatalf("got %v", err)
	}
	e.mail.Err = nil
	// No cool-down is held: the user can retry at once.
	if _, err := e.svc.Start(ctx, goodForm()); err != nil {
		t.Fatalf("retry: %v", err)
	}
}

func TestVerifyEmailTakenMeanwhile(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	_, _ = e.svc.Start(ctx, goodForm())
	e.store.emails[mail1] = true
	if _, err := e.svc.Verify(ctx, mail1, e.lastCode(t)); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("got %v", err)
	}
}

func TestPseudonymCollisionIsRetried(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	_, _ = e.svc.Start(ctx, goodForm())
	e.store.pseudErr = 2
	if _, err := e.svc.Verify(ctx, mail1, e.lastCode(t)); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordHashing(t *testing.T) {
	h1, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	h2, _ := HashPassword("correct horse")
	if h1 == h2 {
		t.Fatal("hashes are not salted")
	}
	if !VerifyPassword("correct horse", h1) || VerifyPassword("wrong", h1) {
		t.Fatal("verify")
	}
	for _, bad := range []string{"", "x", "$argon2id$v=19$m=1,t=1,p=1$!!$!!", "$bcrypt$a$b$c$d"} {
		if VerifyPassword("x", bad) {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestOTPAndPseudonymShape(t *testing.T) {
	re := regexp.MustCompile(`^\d{6}$`)
	seen := map[string]bool{}
	for range 50 {
		c, err := NewOTP()
		if err != nil || !re.MatchString(c) {
			t.Fatalf("otp %q %v", c, err)
		}
		p, _ := NewPseudonym()
		if seen[p] {
			t.Fatal("pseudonym repeated")
		}
		seen[p] = true
	}
	salt, _ := NewSalt()
	h := HashOTP(salt, "a@b.c", "123456")
	if !OTPMatches(h, salt, "a@b.c", "123456") || OTPMatches(h, salt, "a@b.c", "123457") || OTPMatches(h, salt, "x@b.c", "123456") {
		t.Fatal("otp hash")
	}
}
