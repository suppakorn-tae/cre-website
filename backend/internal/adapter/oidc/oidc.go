// Package oidc is the OpenID Connect client the api uses for Google sign-in:
// discovery, the authorization URL (code flow with PKCE), the code exchange
// and server-side ID token validation against a cached JWKS. Only RS256 is
// accepted, which is what Google signs with.
package oidc

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
)

// ErrInvalidToken is returned for any ID token that fails validation.
var ErrInvalidToken = errors.New("oidc: invalid id token")

const (
	jwksTTL     = time.Hour        // keys are refetched after this
	jwksMinWait = time.Minute      // unknown kid refetches at most this often
	clockSkew   = 60 * time.Second // tolerated on exp and iat
	maxBody     = 1 << 20
)

// Config names the client and the provider.
type Config struct {
	Issuer       string // https://accounts.google.com
	ClientID     string
	ClientSecret string
	RedirectURL  string
	HTTP         *http.Client // nil means a client with a 10 s timeout
}

// Claims are the validated parts of an ID token.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
}

// Provider is safe for concurrent use. Discovery runs on first use, so the
// api starts without reaching the provider.
type Provider struct {
	cfg Config
	now func() time.Time

	mu        sync.Mutex
	authURL   string
	tokenURL  string
	jwksURL   string
	keys      map[string]*rsa.PublicKey
	keysAt    time.Time
	refreshAt time.Time
}

// New builds a Provider.
func New(cfg Config) *Provider {
	if cfg.HTTP == nil {
		cfg.HTTP = &http.Client{Timeout: 10 * time.Second}
	}
	cfg.Issuer = strings.TrimSuffix(cfg.Issuer, "/")
	return &Provider{cfg: cfg, now: time.Now}
}

// Challenge is the S256 PKCE code challenge of a verifier.
func Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (p *Provider) getJSON(ctx context.Context, u string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	return p.do(req, v)
}

func (p *Provider) do(req *http.Request, v any) error {
	resp, err := p.cfg.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("oidc: %s answered %d", req.URL.Path, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(v)
}

// discover loads the endpoints once. Call with p.mu held.
func (p *Provider) discover(ctx context.Context) error {
	if p.tokenURL != "" {
		return nil
	}
	var d struct {
		Issuer   string `json:"issuer"`
		AuthURL  string `json:"authorization_endpoint"`
		TokenURL string `json:"token_endpoint"`
		JWKSURL  string `json:"jwks_uri"`
	}
	if err := p.getJSON(ctx, p.cfg.Issuer+"/.well-known/openid-configuration", &d); err != nil {
		return fmt.Errorf("oidc: discovery: %w", err)
	}
	if strings.TrimSuffix(d.Issuer, "/") != p.cfg.Issuer || d.AuthURL == "" || d.TokenURL == "" || d.JWKSURL == "" {
		return errors.New("oidc: discovery document does not match the issuer")
	}
	p.authURL, p.tokenURL, p.jwksURL = d.AuthURL, d.TokenURL, d.JWKSURL
	return nil
}

// AuthURL is the provider URL the browser navigates to.
func (p *Provider) AuthURL(ctx context.Context, state, nonce, challenge string) (string, error) {
	p.mu.Lock()
	err := p.discover(ctx)
	base := p.authURL
	p.mu.Unlock()
	if err != nil {
		return "", err
	}
	q := url.Values{
		"client_id": {p.cfg.ClientID}, "redirect_uri": {p.cfg.RedirectURL},
		"response_type": {"code"}, "scope": {"openid email"},
		"state": {state}, "nonce": {nonce},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + q.Encode(), nil
}

// Exchange trades the code for tokens and returns the validated ID token
// claims. nonce must equal the one sent in AuthURL.
func (p *Provider) Exchange(ctx context.Context, code, verifier, nonce string) (Claims, error) {
	p.mu.Lock()
	err := p.discover(ctx)
	tokenURL := p.tokenURL
	p.mu.Unlock()
	if err != nil {
		return Claims{}, err
	}
	form := url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {p.cfg.RedirectURL},
		"client_id": {p.cfg.ClientID}, "client_secret": {p.cfg.ClientSecret}, "code_verifier": {verifier},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return Claims{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := p.do(req, &tok); err != nil {
		return Claims{}, fmt.Errorf("oidc: token exchange: %w", err)
	}
	return p.Verify(ctx, tok.IDToken, nonce)
}

// key returns the signing key for kid, refetching the JWKS when it is stale
// or the kid is unknown (key rotation).
func (p *Provider) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	if k, ok := p.keys[kid]; ok && now.Sub(p.keysAt) < jwksTTL {
		return k, nil
	}
	if now.Before(p.refreshAt) {
		if k, ok := p.keys[kid]; ok {
			return k, nil
		}
		return nil, ErrInvalidToken
	}
	if err := p.discover(ctx); err != nil {
		return nil, err
	}
	p.refreshAt = now.Add(jwksMinWait)
	var set struct {
		Keys []struct{ Kty, Kid, Alg, Use, N, E string } `json:"keys"`
	}
	if err := p.getJSON(ctx, p.jwksURL, &set); err != nil {
		return nil, fmt.Errorf("oidc: jwks: %w", err)
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" || (k.Use != "" && k.Use != "sig") {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil || len(e) > 4 {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	p.keys, p.keysAt = keys, now
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	return nil, ErrInvalidToken
}

// audience accepts a string or an array of strings.
type audience []string

func (a *audience) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		*a = audience{s}
		return nil
	}
	return json.Unmarshal(b, (*[]string)(a))
}

// flexBool accepts true or "true" (some providers send a string).
type flexBool bool

func (f *flexBool) UnmarshalJSON(b []byte) error {
	*f = flexBool(string(b) == "true" || string(b) == `"true"`)
	return nil
}

// Verify checks signature, iss, aud (and azp), exp, iat and nonce.
func (p *Provider) Verify(ctx context.Context, raw, nonce string) (Claims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 || nonce == "" {
		return Claims{}, ErrInvalidToken
	}
	var hdr struct{ Alg, Kid string }
	if decodePart(parts[0], &hdr) != nil || hdr.Alg != "RS256" {
		return Claims{}, ErrInvalidToken
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	k, err := p.key(ctx, hdr.Kid)
	if err != nil {
		return Claims{}, err
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(k, crypto.SHA256, sum[:], sig) != nil {
		return Claims{}, ErrInvalidToken
	}
	var c struct {
		Iss           string   `json:"iss"`
		Aud           audience `json:"aud"`
		Azp           string   `json:"azp"`
		Exp           int64    `json:"exp"`
		Iat           int64    `json:"iat"`
		Nonce         string   `json:"nonce"`
		Sub           string   `json:"sub"`
		Email         string   `json:"email"`
		EmailVerified flexBool `json:"email_verified"`
	}
	if decodePart(parts[1], &c) != nil {
		return Claims{}, ErrInvalidToken
	}
	now := p.now()
	// Google documents both forms of its issuer.
	issOK := c.Iss == p.cfg.Issuer || "https://"+c.Iss == p.cfg.Issuer
	audOK := slices.Contains(c.Aud, p.cfg.ClientID) && (len(c.Aud) == 1 || c.Azp == p.cfg.ClientID)
	switch {
	case !issOK, !audOK, c.Sub == "",
		now.After(time.Unix(c.Exp, 0).Add(clockSkew)),
		time.Unix(c.Iat, 0).After(now.Add(clockSkew)),
		subtle.ConstantTimeCompare([]byte(c.Nonce), []byte(nonce)) != 1:
		return Claims{}, ErrInvalidToken
	}
	return Claims{Subject: c.Sub, Email: c.Email, EmailVerified: bool(c.EmailVerified)}, nil
}

func decodePart(s string, v any) error {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
