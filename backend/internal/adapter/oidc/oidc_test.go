package oidc_test

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc/oidctest"
)

const clientID = "cre-client"

func newPair(t *testing.T) (*oidctest.Provider, *oidc.Provider) {
	fake := oidctest.New(t, clientID)
	return fake, oidc.New(oidc.Config{
		Issuer: fake.Issuer(), ClientID: clientID, ClientSecret: "s", RedirectURL: "https://app.example.com/cb",
	})
}

var alice = oidctest.Identity{Subject: "g-1", Email: "alice@example.com", EmailVerified: true}

func TestAuthURLCarriesPKCEStateAndNonce(t *testing.T) {
	_, p := newPair(t)
	raw, err := p.AuthURL(context.Background(), "st", "no", oidc.Challenge("ver"))
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(raw)
	q := u.Query()
	want := map[string]string{
		"client_id": clientID, "response_type": "code", "scope": "openid email", "state": "st", "nonce": "no",
		"code_challenge": oidc.Challenge("ver"), "code_challenge_method": "S256",
		"redirect_uri": "https://app.example.com/cb",
	}
	for k, v := range want {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
	if !strings.HasSuffix(u.Path, "/auth") {
		t.Errorf("path %s", u.Path)
	}
}

func TestExchangeValidatesAndCachesJWKS(t *testing.T) {
	fake, p := newPair(t)
	ctx := context.Background()
	for _, code := range []string{"c1", "c2"} {
		fake.Grant(code, "n", oidc.Challenge("v"), alice)
		c, err := p.Exchange(ctx, code, "v", "n")
		if err != nil {
			t.Fatal(err)
		}
		if c.Subject != "g-1" || c.Email != "alice@example.com" || !c.EmailVerified {
			t.Fatalf("claims %+v", c)
		}
	}
	if fake.JWKSHits != 1 {
		t.Fatalf("jwks fetched %d times, want 1 (cached)", fake.JWKSHits)
	}
}

func TestExchangeRejectsWrongVerifier(t *testing.T) {
	fake, p := newPair(t)
	fake.Grant("c", "n", oidc.Challenge("v"), alice)
	if _, err := p.Exchange(context.Background(), "c", "other", "n"); err == nil {
		t.Fatal("wrong PKCE verifier accepted")
	}
}

func TestUnverifiedEmailIsReported(t *testing.T) {
	fake, p := newPair(t)
	id := alice
	id.EmailVerified = false
	c, err := p.Verify(context.Background(), fake.Sign(id, "n"), "n")
	if err != nil || c.EmailVerified {
		t.Fatalf("got %+v, %v", c, err)
	}
	// Some providers send the flag as a string.
	id.Claims = map[string]any{"email_verified": "true"}
	if c, _ := p.Verify(context.Background(), fake.Sign(id, "n"), "n"); !c.EmailVerified {
		t.Fatal(`"true" not read as verified`)
	}
}

func TestVerifyRejects(t *testing.T) {
	fake, p := newPair(t)
	now := time.Now()
	with := func(extra map[string]any) string {
		id := alice
		id.Claims = extra
		return fake.Sign(id, "n")
	}
	good := fake.Sign(alice, "n")
	parts := strings.Split(good, ".")
	cases := map[string]struct{ token, nonce string }{
		"wrong nonce":       {good, "other"},
		"empty nonce":       {good, ""},
		"wrong audience":    {with(map[string]any{"aud": "someone-else"}), "n"},
		"multi aud, no azp": {with(map[string]any{"aud": []string{clientID, "x"}}), "n"},
		"wrong issuer":      {with(map[string]any{"iss": "https://evil.example.com"}), "n"},
		"expired":           {with(map[string]any{"exp": now.Add(-5 * time.Minute).Unix()}), "n"},
		"issued in future":  {with(map[string]any{"iat": now.Add(time.Hour).Unix()}), "n"},
		"no subject":        {with(map[string]any{"sub": ""}), "n"},
		"tampered payload":  {parts[0] + "." + strings.Split(with(map[string]any{"sub": "g-2"}), ".")[1] + "." + parts[2], "n"},
		"bad signature":     {parts[0] + "." + parts[1] + "." + parts[2][:len(parts[2])-4] + "AAAA", "n"},
		"alg none":          {fake.SignRaw(map[string]string{"alg": "none", "kid": "k1"}, map[string]any{"sub": "g-1"}), "n"},
		"unknown kid":       {fake.SignRaw(map[string]string{"alg": "RS256", "kid": "zz"}, map[string]any{"sub": "g-1"}), "n"},
		"not a jwt":         {"abc", "n"},
		"two-part token":    {parts[0] + "." + parts[1], "n"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := p.Verify(context.Background(), tc.token, tc.nonce); err == nil {
				t.Fatal("accepted")
			}
		})
	}
	// Multiple audiences are fine when azp names this client.
	if _, err := p.Verify(context.Background(), with(map[string]any{"aud": []string{clientID, "x"}, "azp": clientID}), "n"); err != nil {
		t.Fatalf("aud array with azp: %v", err)
	}
	if _, err := p.Verify(context.Background(), good, "other"); !errors.Is(err, oidc.ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}

func TestDiscoveryIssuerMismatch(t *testing.T) {
	fake := oidctest.New(t, clientID)
	p := oidc.New(oidc.Config{Issuer: fake.Issuer() + "/other", ClientID: clientID})
	if _, err := p.AuthURL(context.Background(), "s", "n", "c"); err == nil {
		t.Fatal("discovery of a different issuer accepted")
	}
}
