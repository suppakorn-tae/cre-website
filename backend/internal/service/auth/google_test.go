package auth

import (
	"context"
	"errors"
	"net/url"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc/oidctest"
)

type gAcc struct {
	GoogleAccount
	email, sub string
}

// gStore is an in-memory GoogleStore.
type gStore struct{ accs []*gAcc }

func (s *gStore) find(f func(*gAcc) bool) (GoogleAccount, error) {
	for _, a := range s.accs {
		if f(a) {
			a.HasGoogle = a.sub != ""
			return a.GoogleAccount, nil
		}
	}
	return GoogleAccount{}, ErrLoginNoAccount
}

func (s *gStore) BySub(_ context.Context, sub string) (GoogleAccount, error) {
	return s.find(func(a *gAcc) bool { return a.sub == sub })
}

func (s *gStore) ByEmail(_ context.Context, e string) (GoogleAccount, error) {
	return s.find(func(a *gAcc) bool { return a.email == e })
}

func (s *gStore) byID(id string) *gAcc {
	for _, a := range s.accs {
		if a.ID == id {
			return a
		}
	}
	return nil
}

func (s *gStore) LinkSub(_ context.Context, id, sub string) (bool, error) {
	if _, err := s.BySub(context.Background(), sub); err == nil {
		return false, ErrGoogleAlreadyLinked
	}
	a := s.byID(id)
	if a == nil || a.sub != "" || a.Status != loginStatusActive {
		return false, nil
	}
	a.sub = sub
	return true, nil
}

func (s *gStore) CreateGoogleAccount(_ context.Context, n NewAccount, sub string) (Account, error) {
	if _, err := s.BySub(context.Background(), sub); err == nil {
		return Account{}, ErrGoogleAlreadyLinked
	}
	if _, err := s.ByEmail(context.Background(), n.Email); err == nil {
		return Account{}, ErrEmailTaken
	}
	s.add(n.ID.String(), n.Email, sub, false, loginStatusActive)
	return Account{ID: n.ID, Email: n.Email, Organisation: n.Organisation, SessionVersion: 1}, nil
}

func (s *gStore) add(id, email, sub string, pw bool, status string) {
	s.accs = append(s.accs, &gAcc{GoogleAccount{ID: id, Status: status, Version: 1, HasPassword: pw}, email, sub})
}

type fakeSessions struct{ issued []string }

func (f *fakeSessions) Issue(id string, _ int, _ bool) (string, time.Time) {
	f.issued = append(f.issued, id)
	return "tok-" + id, time.Now().Add(time.Hour)
}
func (*fakeSessions) BumpVersion(context.Context, string) (int, error) { return 2, nil }

type gEnv struct {
	svc   *Google
	fake  *oidctest.Provider
	store *gStore
	cache *memCache
	sess  *fakeSessions
	clk   *clock
}

const (
	aliceID = "11111111-1111-1111-1111-111111111111"
)

func newGEnv(t *testing.T) gEnv {
	fake := oidctest.New(t, "cid")
	idp := oidc.New(oidc.Config{Issuer: fake.Issuer(), ClientID: "cid", ClientSecret: "sec", RedirectURL: "https://x/cb"})
	clk := &clock{t: time.Now()}
	e := gEnv{fake: fake, store: &gStore{}, cache: newMem(clk), sess: &fakeSessions{}, clk: clk}
	e.svc = NewGoogle(idp, e.store, e.cache, e.sess)
	e.svc.now = clk.now
	return e
}

var googleAlice = oidctest.Identity{Subject: "g-alice", Email: "Alice@Example.com", EmailVerified: true}

// start begins a flow and lets the fake provider accept code "code" for id.
func (e gEnv) start(t *testing.T, intent string, id oidctest.Identity) string {
	t.Helper()
	raw, state, err := e.svc.Start(context.Background(), intent)
	if err != nil {
		t.Fatal(err)
	}
	q := mustQuery(t, raw)
	if q.Get("state") != state || q.Get("code_challenge_method") != "S256" {
		t.Fatalf("authorization url %s", raw)
	}
	e.fake.Grant("code", q.Get("nonce"), q.Get("code_challenge"), id)
	return state
}

func mustQuery(t *testing.T, raw string) url.Values {
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u.Query()
}

func (e gEnv) callback(t *testing.T, state string) CallbackOutcome {
	t.Helper()
	out, err := e.svc.Callback(context.Background(), CallbackInput{State: state, Code: "code"})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestGoogleStateLivesTenMinutes(t *testing.T) {
	e := newGEnv(t)
	state := e.start(t, IntentLogin, googleAlice)
	e.clk.add(GoogleStateTTL)
	if out := e.callback(t, state); out.Result != ResultFailed {
		t.Fatalf("expired state: %s", out.Result)
	}
}

func TestGoogleRejectsTamperedOrReplayedState(t *testing.T) {
	e := newGEnv(t)
	e.store.add(aliceID, "alice@example.com", "g-alice", true, loginStatusActive)
	state := e.start(t, IntentLogin, googleAlice)
	if out := e.callback(t, state+"x"); out.Result != ResultFailed {
		t.Fatalf("tampered state: %s", out.Result)
	}
	if out := e.callback(t, ""); out.Result != ResultFailed {
		t.Fatalf("empty state: %s", out.Result)
	}
	if out := e.callback(t, state); out.Result != ResultLoggedIn {
		t.Fatalf("first use: %s", out.Result)
	}
	e.fake.Grant("code", "n", "c", googleAlice)
	if out := e.callback(t, state); out.Result != ResultFailed {
		t.Fatalf("replayed state: %s", out.Result)
	}
	if len(e.sess.issued) != 1 {
		t.Fatalf("sessions issued: %v", e.sess.issued)
	}
}

func TestGoogleRejectsWrongNonce(t *testing.T) {
	e := newGEnv(t)
	e.store.add(aliceID, "alice@example.com", "g-alice", true, loginStatusActive)
	raw, state, err := e.svc.Start(context.Background(), IntentLogin)
	if err != nil {
		t.Fatal(err)
	}
	e.fake.Grant("code", "attacker-nonce", mustQuery(t, raw).Get("code_challenge"), googleAlice)
	if out := e.callback(t, state); out.Result != ResultFailed || out.Session != nil {
		t.Fatalf("wrong nonce: %+v", out)
	}
}

func TestGoogleRejectsUnverifiedEmail(t *testing.T) {
	e := newGEnv(t)
	e.store.add(aliceID, "alice@example.com", "", true, loginStatusActive)
	id := googleAlice
	id.EmailVerified = false
	state := e.start(t, IntentLogin, id)
	if out := e.callback(t, state); out.Result != ResultFailed || out.Session != nil {
		t.Fatalf("unverified e-mail: %+v", out)
	}
	if e.store.accs[0].sub != "" {
		t.Fatal("unverified e-mail was linked")
	}
}

func TestGoogleRejectsWrongAudience(t *testing.T) {
	e := newGEnv(t)
	id := googleAlice
	id.Claims = map[string]any{"aud": "other-client"}
	state := e.start(t, IntentSignup, id)
	if out := e.callback(t, state); out.Result != ResultFailed {
		t.Fatalf("wrong aud: %s", out.Result)
	}
}

func TestGoogleCancelled(t *testing.T) {
	e := newGEnv(t)
	state := e.start(t, IntentSignup, googleAlice)
	out, err := e.svc.Callback(context.Background(), CallbackInput{State: state, Error: "access_denied"})
	if err != nil || out.Result != ResultCancelled || out.Intent != IntentSignup {
		t.Fatalf("%+v %v", out, err)
	}
}

func TestGoogleLoginLinksExistingEmail(t *testing.T) {
	e := newGEnv(t)
	e.store.add(aliceID, "alice@example.com", "", true, loginStatusActive)
	out := e.callback(t, e.start(t, IntentLogin, googleAlice))
	if out.Result != ResultLoggedIn || out.Session == nil || out.Session.AccountID != aliceID {
		t.Fatalf("%+v", out)
	}
	if e.store.accs[0].sub != "g-alice" {
		t.Fatal("google id not linked to the e-mail account")
	}
}

func TestGoogleLoginOutcomes(t *testing.T) {
	e := newGEnv(t)
	if out := e.callback(t, e.start(t, IntentLogin, googleAlice)); out.Result != ResultNoAccount {
		t.Fatalf("unknown identity: %s", out.Result)
	}
	e.store.add(aliceID, "alice@example.com", "g-alice", true, "deactivated")
	if out := e.callback(t, e.start(t, IntentLogin, googleAlice)); out.Result != ResultUnavailable {
		t.Fatalf("deactivated: %s", out.Result)
	}
}

func TestGoogleSignupParksThenCompletes(t *testing.T) {
	e := newGEnv(t)
	ctx := context.Background()
	out := e.callback(t, e.start(t, IntentSignup, googleAlice))
	if out.Result != ResultNeedsSignup || out.PendingToken == "" || out.Session != nil {
		t.Fatalf("%+v", out)
	}
	if len(e.store.accs) != 0 {
		t.Fatal("account created before the notice was accepted")
	}
	email, left, err := e.svc.Pending(ctx, out.PendingToken)
	if err != nil || email != "alice@example.com" || left != GooglePendingTTL {
		t.Fatalf("pending: %q %v %v", email, left, err)
	}

	_, _, err = e.svc.Complete(ctx, out.PendingToken, "", false, true)
	var v ValidationError
	if !errors.As(err, &v) || v[0].Code != CodeRetentionRequired || len(e.store.accs) != 0 {
		t.Fatalf("retention not accepted: %v", err)
	}
	acc, sess, err := e.svc.Complete(ctx, out.PendingToken, " บริษัท ", true, true)
	if err != nil || acc.Email != "alice@example.com" || *acc.Organisation != "บริษัท" || sess.Token == "" {
		t.Fatalf("complete: %+v %v", acc, err)
	}
	if e.store.accs[0].sub != "g-alice" || e.store.accs[0].HasPassword {
		t.Fatalf("stored %+v", e.store.accs[0])
	}
	if _, _, err := e.svc.Complete(ctx, out.PendingToken, "", true, true); !errors.Is(err, ErrNoPending) {
		t.Fatalf("second complete: %v", err)
	}
}

func TestGooglePendingExpires(t *testing.T) {
	e := newGEnv(t)
	out := e.callback(t, e.start(t, IntentSignup, googleAlice))
	e.clk.add(GooglePendingTTL)
	if _, _, err := e.svc.Pending(context.Background(), out.PendingToken); !errors.Is(err, ErrNoPending) {
		t.Fatalf("got %v", err)
	}
	if _, _, err := e.svc.Pending(context.Background(), ""); !errors.Is(err, ErrNoPending) {
		t.Fatalf("empty token: %v", err)
	}
}

func TestGoogleStateIsRandom(t *testing.T) {
	e := newGEnv(t)
	_, s1, _ := e.svc.Start(context.Background(), IntentLogin)
	_, s2, _ := e.svc.Start(context.Background(), IntentSignup)
	if s1 == s2 || len(s1) < 20 {
		t.Fatalf("states %q %q", s1, s2)
	}
	if _, _, err := e.svc.Start(context.Background(), "other"); !errors.Is(err, ErrGoogleIntent) {
		t.Fatalf("bad intent: %v", err)
	}
}
