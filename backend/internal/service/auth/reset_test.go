package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
)

var resetOTPPattern = regexp.MustCompile(`[0-9]{6}`)

type resetEnv struct {
	s     *ResetService
	store *loginFakeStore
	sess  *loginFakeSessions
	mail  *mailer.Fake
	cache *loginMemCache
}

func resetNewEnv(t *testing.T) resetEnv {
	t.Helper()
	st := &loginFakeStore{accs: map[string]LoginAccount{
		"a@example.com": {ID: "a", PasswordHash: loginMustHash(t, "old-password"), Status: "active", Version: 1},
		"g@example.com": {ID: "g", HasGoogle: true, Status: "active", Version: 1},
		"off@example.com": {
			ID: "off", PasswordHash: loginMustHash(t, "old-password"), Status: "deactivated",
			Version: 1,
		},
	}}
	e := resetEnv{store: st, sess: &loginFakeSessions{}, mail: &mailer.Fake{}, cache: loginNewMemCache()}
	s, err := NewResetService(st, e.sess, e.cache, e.mail, nil)
	if err != nil {
		t.Fatal(err)
	}
	s.Async = func(f func()) { f() }
	e.s = s
	return e
}

// code requests a code for email and returns the OTP from the sent e-mail.
func (e resetEnv) code(t *testing.T, email string) string {
	t.Helper()
	n := len(e.mail.Sent())
	if _, err := e.s.RequestCode(context.Background(), email); err != nil {
		t.Fatal(err)
	}
	sent := e.mail.Sent()
	if len(sent) != n+1 {
		t.Fatalf("no e-mail sent to %s", email)
	}
	return resetOTPPattern.FindString(sent[n].Subject + sent[n].Body)
}

func TestRequestCodeSameAnswerForAnyEmail(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()
	var chs []ResetChallenge
	for _, em := range []string{"a@example.com", "nobody@example.com", "g@example.com", "off@example.com"} {
		ch, err := e.s.RequestCode(ctx, em)
		if err != nil {
			t.Fatalf("%s: %v", em, err)
		}
		chs = append(chs, ch)
	}
	for _, c := range chs[1:] {
		if c != chs[0] {
			t.Fatalf("challenges differ: %+v vs %+v", c, chs[0])
		}
	}
	sent := e.mail.Sent()
	if len(sent) != 2 || sent[0].To != "a@example.com" || sent[1].To != "g@example.com" {
		t.Fatalf("sent = %+v, want e-mails to a@ and g@ only", sent)
	}
	if resetOTPPattern.MatchString(sent[1].Subject+sent[1].Body) || !strings.Contains(sent[1].Body, "Google") {
		t.Fatalf("google mail wrong: %+v", sent[1])
	}
}

func TestRequestCodeCooldownAppliesToEveryEmail(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()
	for _, em := range []string{"a@example.com", "nobody@example.com"} {
		if _, err := e.s.RequestCode(ctx, em); err != nil {
			t.Fatal(err)
		}
		if _, err := e.s.RequestCode(ctx, em); !errors.Is(err, ErrResetCooldown) {
			t.Fatalf("%s second request: %v, want cool-down", em, err)
		}
	}
}

func TestResetSetsPasswordAndEndsSessions(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()
	code := e.code(t, "a@example.com")
	if err := e.s.Reset(ctx, "A@example.com", code, "brand-new-pass", "brand-new-pass"); err != nil {
		t.Fatal(err)
	}
	if len(e.sess.bumped) != 1 || e.sess.bumped[0] != "a" {
		t.Errorf("bumped = %v, want [a]", e.sess.bumped)
	}
	if !VerifyPassword("brand-new-pass", e.store.accs["a@example.com"].PasswordHash) {
		t.Error("new password not stored")
	}
	// The code is spent.
	if err := e.s.Reset(ctx, "a@example.com", code, "another-pass-1", "another-pass-1"); !errors.Is(err, ErrResetOTPExpired) {
		t.Errorf("reuse: %v, want expired", err)
	}
}

func TestResetOTPFailures(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()

	if err := e.s.Reset(ctx, "nobody@example.com", "123456", "brand-new-pass", "brand-new-pass"); !errors.Is(err, ErrResetOTPExpired) {
		t.Errorf("never issued: %v, want expired", err)
	}

	code := e.code(t, "a@example.com")
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	for i := 1; i <= 5; i++ {
		if err := e.s.Reset(ctx, "a@example.com", wrong, "brand-new-pass", "brand-new-pass"); !errors.Is(err, ErrResetOTPInvalid) {
			t.Fatalf("attempt %d: %v, want invalid", i, err)
		}
	}
	// More than 5 wrong attempts: even the right code is refused.
	if err := e.s.Reset(ctx, "a@example.com", code, "brand-new-pass", "brand-new-pass"); !errors.Is(err, ErrResetOTPLocked) {
		t.Fatalf("sixth attempt: %v, want locked", err)
	}
	if len(e.sess.bumped) != 0 {
		t.Error("sessions bumped without a successful reset")
	}
	if !VerifyPassword("old-password", e.store.accs["a@example.com"].PasswordHash) {
		t.Error("password changed")
	}
}

func TestResetFifthAttemptStillWorks(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()
	code := e.code(t, "a@example.com")
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	for range 4 {
		_ = e.s.Reset(ctx, "a@example.com", wrong, "brand-new-pass", "brand-new-pass")
	}
	if err := e.s.Reset(ctx, "a@example.com", code, "brand-new-pass", "brand-new-pass"); err != nil {
		t.Fatalf("fifth attempt: %v", err)
	}
}

func TestRequestCodeWithoutMailer(t *testing.T) {
	e := resetNewEnv(t)
	s, err := NewResetService(e.store, e.sess, e.cache, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, em := range []string{"a@example.com", "nobody@example.com"} {
		if _, err := s.RequestCode(context.Background(), em); !errors.Is(err, ErrResetMailUnavailable) {
			t.Errorf("%s: %v, want ErrResetMailUnavailable", em, err)
		}
	}
}

func TestResetPasswordValidationKeepsCode(t *testing.T) {
	e := resetNewEnv(t)
	ctx := context.Background()
	code := e.code(t, "a@example.com")
	if err := e.s.Reset(ctx, "a@example.com", code, "short", "short"); !errors.Is(err, ErrResetPasswordShort) {
		t.Errorf("short: %v", err)
	}
	if err := e.s.Reset(ctx, "a@example.com", code, "brand-new-pass", "different-pass"); !errors.Is(err, ErrResetPasswordMismatch) {
		t.Errorf("mismatch: %v", err)
	}
	if err := e.s.Reset(ctx, "a@example.com", code, "brand-new-pass", "brand-new-pass"); err != nil {
		t.Errorf("valid after bad password: %v", err)
	}
}

func TestResetConcurrentSameCodeSucceedsOnce(t *testing.T) {
	e := resetNewEnv(t)
	code := e.code(t, "a@example.com")
	const n = 4 // below the 5-attempt lock
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = e.s.Reset(context.Background(), "a@example.com", code, "brand-new-pass", "brand-new-pass")
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case !errors.Is(err, ErrResetOTPExpired):
			t.Errorf("unexpected error: %v", err)
		}
	}
	if ok != 1 || len(e.sess.bumped) != 1 {
		t.Errorf("successes = %d, bumps = %d, want 1 and 1", ok, len(e.sess.bumped))
	}
}
