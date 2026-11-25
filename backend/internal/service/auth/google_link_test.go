package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc/oidctest"
)

const bobID = "22222222-2222-2222-2222-222222222222"

func (s *gStore) ByID(_ context.Context, id string) (GoogleAccount, error) {
	return s.find(func(a *gAcc) bool { return a.ID == id })
}

func (s *gStore) UnlinkSub(_ context.Context, id string) (bool, error) {
	a := s.byID(id)
	if a == nil || a.sub == "" || !a.HasPassword {
		return false, nil
	}
	a.sub = ""
	return true, nil
}

// startAs begins a link or reauth for account and lets the fake provider
// accept code "code" for id.
func (e gEnv) startAs(t *testing.T, intent, account string, id oidctest.Identity) string {
	t.Helper()
	raw, state, err := e.svc.StartForAccount(context.Background(), intent, account)
	if err != nil {
		t.Fatal(err)
	}
	q := mustQuery(t, raw)
	e.fake.Grant("code", q.Get("nonce"), q.Get("code_challenge"), id)
	return state
}

func (e gEnv) callbackAs(t *testing.T, state, session string) CallbackOutcome {
	t.Helper()
	out, err := e.svc.Callback(context.Background(), CallbackInput{State: state, Code: "code", SessionAccount: session})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestGoogleLink(t *testing.T) {
	e := newGEnv(t)
	ctx := context.Background()
	e.store.add(aliceID, "alice@example.com", "", true, loginStatusActive)
	e.store.add(bobID, "bob@example.com", "g-bob", true, loginStatusActive)
	if _, _, err := e.svc.StartForAccount(ctx, IntentLink, ""); !errors.Is(err, ErrSessionRequired) {
		t.Fatalf("link without session: %v", err)
	}
	if _, _, err := e.svc.StartForAccount(ctx, IntentLink, bobID); !errors.Is(err, ErrGoogleAlreadyLinked) {
		t.Fatalf("link when linked: %v", err)
	}
	if _, _, err := e.svc.StartForAccount(ctx, IntentLogin, aliceID); !errors.Is(err, ErrGoogleIntent) {
		t.Fatalf("login intent: %v", err)
	}
	// The callback must arrive in the session that started the link.
	if out := e.callbackAs(t, e.startAs(t, IntentLink, aliceID, googleAlice), bobID); out.Result != ResultFailed {
		t.Fatalf("other session: %s", out.Result)
	}
	bobsGoogle := oidctest.Identity{Subject: "g-bob", Email: "bob@gmail.com", EmailVerified: true}
	if out := e.callbackAs(t, e.startAs(t, IntentLink, aliceID, bobsGoogle), aliceID); out.Result != ResultAlreadyLinked {
		t.Fatalf("google id of another account: %s", out.Result)
	}
	if out := e.callbackAs(t, e.startAs(t, IntentLink, aliceID, googleAlice), aliceID); out.Result != ResultLinked || out.Session != nil {
		t.Fatalf("link: %+v", out)
	}
	if e.store.accs[0].sub != "g-alice" {
		t.Fatal("not linked")
	}
}

func TestGoogleReauth(t *testing.T) {
	e := newGEnv(t)
	e.store.add(aliceID, "alice@example.com", "g-alice", false, loginStatusActive)
	if out := e.callbackAs(t, e.startAs(t, IntentReauth, aliceID, googleAlice), aliceID); out.Result != ResultReauthed {
		t.Fatalf("reauth: %s", out.Result)
	}
	if _, err := e.cache.Get(context.Background(), ReauthKey(aliceID)); err != nil {
		t.Fatal("reauth not recorded")
	}
	other := oidctest.Identity{Subject: "g-x", Email: "x@example.com", EmailVerified: true}
	if out := e.callbackAs(t, e.startAs(t, IntentReauth, aliceID, other), aliceID); out.Result != ResultFailed {
		t.Fatalf("reauth with another google account: %s", out.Result)
	}
}

func TestGoogleUnlink(t *testing.T) {
	e := newGEnv(t)
	ctx := context.Background()
	e.store.add(aliceID, "alice@example.com", "g-alice", false, loginStatusActive)
	e.store.add(bobID, "bob@example.com", "g-bob", true, loginStatusActive)
	if err := e.svc.Unlink(ctx, aliceID); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("no password: %v", err)
	}
	if err := e.svc.Unlink(ctx, bobID); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Unlink(ctx, bobID); !errors.Is(err, ErrGoogleNotLinked) {
		t.Fatalf("not linked: %v", err)
	}
}
