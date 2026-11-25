// Package oidctest is a fake OpenID provider for tests: discovery, JWKS and a
// token endpoint that signs ID tokens with a generated RSA key.
package oidctest

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// Identity is what the next token exchange returns. Claims overrides or adds
// raw claims (for example a wrong nonce or aud).
type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
	Claims        map[string]any
}

// Provider serves the fake endpoints.
type Provider struct {
	Server   *httptest.Server
	ClientID string
	key      *rsa.PrivateKey

	mu sync.Mutex
	// codes maps an authorization code to its identity, nonce and PKCE
	// challenge.
	codes     map[string]grant
	JWKSHits  int
	TokenHits int
}

type grant struct {
	id               Identity
	nonce, challenge string
}

// New starts a provider; it stops when the test ends.
func New(t testing.TB, clientID string) *Provider {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &Provider{ClientID: clientID, key: k, codes: map[string]grant{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		u := p.Server.URL
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer": u, "authorization_endpoint": u + "/auth",
			"token_endpoint": u + "/token", "jwks_uri": u + "/jwks",
		})
	})
	mux.HandleFunc("GET /jwks", func(w http.ResponseWriter, _ *http.Request) {
		p.mu.Lock()
		p.JWKSHits++
		p.mu.Unlock()
		e := big.NewInt(int64(k.E)).Bytes()
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": "k1", "alg": "RS256", "use": "sig",
			"n": b64(k.N.Bytes()), "e": b64(e),
		}}})
	})
	mux.HandleFunc("POST /token", p.token)
	p.Server = httptest.NewServer(mux)
	t.Cleanup(p.Server.Close)
	return p
}

// Issuer is the provider's issuer URL.
func (p *Provider) Issuer() string { return p.Server.URL }

// Grant registers code: exchanging it with the verifier whose S256 challenge
// is challenge returns an ID token for id carrying nonce.
func (p *Provider) Grant(code, nonce, challenge string, id Identity) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.codes[code] = grant{id: id, nonce: nonce, challenge: challenge}
}

func (p *Provider) token(w http.ResponseWriter, r *http.Request) {
	p.mu.Lock()
	p.TokenHits++
	g, ok := p.codes[r.FormValue("code")]
	delete(p.codes, r.FormValue("code"))
	p.mu.Unlock()
	sum := sha256.Sum256([]byte(r.FormValue("code_verifier")))
	if !ok || b64(sum[:]) != g.challenge || r.FormValue("client_id") != p.ClientID {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"id_token": p.Sign(g.id, g.nonce), "token_type": "Bearer"})
}

// Sign returns an ID token for id signed with the provider key.
func (p *Provider) Sign(id Identity, nonce string) string {
	now := time.Now()
	c := map[string]any{
		"iss": p.Server.URL, "aud": p.ClientID, "sub": id.Subject, "email": id.Email,
		"email_verified": id.EmailVerified, "nonce": nonce,
		"iat": now.Unix(), "exp": now.Add(time.Hour).Unix(),
	}
	for k, v := range id.Claims {
		c[k] = v
	}
	return p.SignRaw(map[string]string{"alg": "RS256", "kid": "k1", "typ": "JWT"}, c)
}

// SignRaw signs any header and claims with the provider key.
func (p *Provider) SignRaw(header map[string]string, claims map[string]any) string {
	h, _ := json.Marshal(header)
	c, _ := json.Marshal(claims)
	in := b64(h) + "." + b64(c)
	sum := sha256.Sum256([]byte(in))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, p.key, crypto.SHA256, sum[:])
	return in + "." + b64(sig)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
