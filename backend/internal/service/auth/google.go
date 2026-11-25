package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/valkey"
)

// Google sign-in lifetimes (architecture: state, nonce and verifier live 10
// minutes in Valkey).
const (
	GoogleStateTTL   = 10 * time.Minute
	GooglePendingTTL = 10 * time.Minute
)

// Google intents (GoogleIntent in the contract).
const (
	IntentLogin  = "login"
	IntentSignup = "signup"
)

// Callback results (GoogleCallbackResult in the contract).
const (
	ResultLoggedIn       = "logged_in"
	ResultNeedsSignup    = "needs_signup"
	ResultNoAccount      = "no_account"
	ResultUnavailable    = "account_unavailable"
	ResultCancelled      = "cancelled"
	ResultFailed         = "failed"
	maxGoogleStateLength = 128
)

// Errors of the Google flow.
var (
	ErrGoogleIntent        = errors.New("auth: unknown google intent")
	ErrGoogleAlreadyLinked = errors.New("auth: google account already linked")
)

// GoogleIDP is the OIDC client (adapter/oidc.Provider).
type GoogleIDP interface {
	AuthURL(ctx context.Context, state, nonce, challenge string) (string, error)
	Exchange(ctx context.Context, code, verifier, nonce string) (oidc.Claims, error)
}

// GoogleAccount is the part of an account row the Google flow needs.
type GoogleAccount struct {
	ID                     string
	Status                 string
	Version                int
	HasPassword, HasGoogle bool
}

// GoogleStore reads and links accounts. Lookups return ErrLoginNoAccount.
type GoogleStore interface {
	BySub(ctx context.Context, sub string) (GoogleAccount, error)
	ByEmail(ctx context.Context, email string) (GoogleAccount, error)
	ByID(ctx context.Context, id string) (GoogleAccount, error)
	// UnlinkSub reports false unless an active account had a Google id and a
	// password.
	UnlinkSub(ctx context.Context, id string) (bool, error)
	// LinkSub reports false when the account is not active or already has a
	// Google id; ErrGoogleAlreadyLinked when another account has sub.
	LinkSub(ctx context.Context, id, sub string) (bool, error)
	// CreateGoogleAccount returns ErrEmailTaken, ErrGoogleAlreadyLinked or
	// errPseudonymUsed on a unique violation.
	CreateGoogleAccount(ctx context.Context, a NewAccount, sub string) (Account, error)
}

// Google runs Google sign-in, sign-up, linking and re-authentication.
type Google struct {
	idp      GoogleIDP
	store    GoogleStore
	cache    valkey.StateStore
	sessions LoginSessions
	now      func() time.Time
}

// NewGoogle builds the service.
func NewGoogle(idp GoogleIDP, store GoogleStore, cache valkey.StateStore, sessions LoginSessions) *Google {
	return &Google{idp: idp, store: store, cache: cache, sessions: sessions, now: time.Now}
}

type googleState struct {
	Intent   string `json:"intent"`
	Nonce    string `json:"nonce"`
	Verifier string `json:"verifier"`
	Account  string `json:"account,omitempty"` // link and reauth only
}

type googlePending struct {
	Sub     string    `json:"sub"`
	Email   string    `json:"email"`
	Expires time.Time `json:"exp"`
}

func stateKey(s string) string { return "google:state:" + s }
func usedKey(s string) string  { return "google:used:" + s }
func pendingGoogleKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return "google:pending:" + hex.EncodeToString(sum[:])
}

// Start stores state, nonce, PKCE verifier and intent for GoogleStateTTL and
// returns the authorization URL and the state.
func (g *Google) Start(ctx context.Context, intent string) (authURL, state string, err error) {
	if intent != IntentLogin && intent != IntentSignup {
		return "", "", ErrGoogleIntent
	}
	return g.begin(ctx, intent, "")
}

func (g *Google) begin(ctx context.Context, intent, accountID string) (authURL, state string, err error) {
	st := googleState{Intent: intent, Nonce: rand.Text(), Verifier: rand.Text() + rand.Text(), Account: accountID}
	state = rand.Text()
	b, _ := json.Marshal(st)
	if err := g.cache.Set(ctx, stateKey(state), b, GoogleStateTTL); err != nil {
		return "", "", fmt.Errorf("auth: store google state: %w", err)
	}
	authURL, err = g.idp.AuthURL(ctx, state, st.Nonce, oidc.Challenge(st.Verifier))
	return authURL, state, err
}

// CallbackInput is what the Google redirect brings back. SessionAccount is
// the account of the browser's session cookie ("" without one).
type CallbackInput struct{ State, Code, Error, SessionAccount string }

// CallbackOutcome is the result to redirect with. Session is set when the
// user is signed in; PendingToken when a new Google user must accept the
// notice first.
type CallbackOutcome struct {
	Intent, Result string
	Session        *LoginResult
	PendingToken   string
}

// takeState returns the stored state once: a replayed or unknown state
// reports false.
func (g *Google) takeState(ctx context.Context, state string) (googleState, bool, error) {
	var st googleState
	if state == "" || len(state) > maxGoogleStateLength {
		return st, false, nil
	}
	b, err := g.cache.Get(ctx, stateKey(state))
	if errors.Is(err, valkey.ErrNotFound) {
		return st, false, nil
	}
	if err != nil {
		return st, false, fmt.Errorf("auth: load google state: %w", err)
	}
	first, err := g.cache.SetNX(ctx, usedKey(state), []byte("1"), GoogleStateTTL)
	if err != nil {
		return st, false, fmt.Errorf("auth: claim google state: %w", err)
	}
	_ = g.cache.Del(ctx, stateKey(state))
	if !first || json.Unmarshal(b, &st) != nil {
		return st, false, nil
	}
	return st, true, nil
}

// Callback validates the state, exchanges the code (the adapter checks the
// ID token's signature, iss, aud, exp and nonce), requires a verified e-mail
// and signs in or parks the identity. Validation failures give ResultFailed,
// not an error; an error is an infrastructure failure.
func (g *Google) Callback(ctx context.Context, in CallbackInput) (CallbackOutcome, error) {
	st, ok, err := g.takeState(ctx, in.State)
	if err != nil || !ok {
		return CallbackOutcome{Result: ResultFailed}, err
	}
	out := CallbackOutcome{Intent: st.Intent, Result: ResultFailed}
	if in.Error != "" {
		out.Result = ResultCancelled
		return out, nil
	}
	if st.Account != in.SessionAccount && st.Account != "" {
		return out, nil // link or reauth finished in another session
	}
	c, err := g.idp.Exchange(ctx, in.Code, st.Verifier, st.Nonce)
	email := NormaliseEmail(c.Email)
	if err != nil || !c.EmailVerified || c.Subject == "" || !validEmail(email) {
		return out, nil
	}
	switch st.Intent {
	case IntentLink:
		out.Result, err = g.link(ctx, st.Account, c.Subject)
	case IntentReauth:
		out.Result, err = g.reauth(ctx, st.Account, c.Subject)
	default:
		err = g.signIn(ctx, st.Intent, c.Subject, email, &out)
	}
	if err != nil {
		return CallbackOutcome{Intent: st.Intent, Result: ResultFailed}, err
	}
	return out, nil
}

// signIn finds the account by Google id, else by verified e-mail (linking
// the Google id, BR-16). Without one, login answers no_account and signup
// parks the identity until the notice is accepted.
func (g *Google) signIn(ctx context.Context, intent, sub, email string, out *CallbackOutcome) error {
	acc, err := g.store.BySub(ctx, sub)
	if errors.Is(err, ErrLoginNoAccount) {
		acc, err = g.store.ByEmail(ctx, email)
		if err == nil && acc.Status == loginStatusActive {
			if acc.HasGoogle { // the e-mail's account uses another Google id
				return nil
			}
			ok, lerr := g.store.LinkSub(ctx, acc.ID, sub)
			if errors.Is(lerr, ErrGoogleAlreadyLinked) || (lerr == nil && !ok) {
				return nil
			}
			if lerr != nil {
				return lerr
			}
		}
	}
	switch {
	case errors.Is(err, ErrLoginNoAccount) && intent == IntentLogin:
		out.Result = ResultNoAccount
		return nil
	case errors.Is(err, ErrLoginNoAccount):
		token := rand.Text() + rand.Text()
		b, _ := json.Marshal(googlePending{Sub: sub, Email: email, Expires: g.now().Add(GooglePendingTTL)})
		if err := g.cache.Set(ctx, pendingGoogleKey(token), b, GooglePendingTTL); err != nil {
			return fmt.Errorf("auth: park google sign-up: %w", err)
		}
		out.Result, out.PendingToken = ResultNeedsSignup, token
		return nil
	case err != nil:
		return err
	case acc.Status != loginStatusActive:
		out.Result = ResultUnavailable
		return nil
	}
	tok, exp := g.sessions.Issue(acc.ID, acc.Version, false)
	out.Result, out.Session = ResultLoggedIn, &LoginResult{AccountID: acc.ID, Token: tok, Expires: exp}
	return nil
}

func (g *Google) pending(ctx context.Context, token string) (googlePending, error) {
	var p googlePending
	if token == "" {
		return p, ErrNoPending
	}
	b, err := g.cache.Get(ctx, pendingGoogleKey(token))
	if errors.Is(err, valkey.ErrNotFound) {
		return p, ErrNoPending
	}
	if err != nil {
		return p, fmt.Errorf("auth: load google sign-up: %w", err)
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return p, fmt.Errorf("auth: decode google sign-up: %w", err)
	}
	return p, nil
}

// Pending returns the e-mail of a parked Google sign-up and its remaining
// lifetime, or ErrNoPending.
func (g *Google) Pending(ctx context.Context, token string) (string, time.Duration, error) {
	p, err := g.pending(ctx, token)
	return p.Email, p.Expires.Sub(g.now()).Round(time.Second), err
}

// Complete creates the account of a parked Google sign-up once the retention
// notice and terms are accepted (FR-51) and returns the new session.
func (g *Google) Complete(ctx context.Context, token, organisation string, retention, terms bool) (Account, LoginResult, error) {
	var v ValidationError
	org := strings.TrimSpace(organisation)
	if utf8.RuneCountInString(org) > maxOrgRunes {
		v = append(v, FieldError{"/organisation", CodeOrgTooLong})
	}
	if !retention {
		v = append(v, FieldError{"/retention_accepted", CodeRetentionRequired})
	}
	if !terms {
		v = append(v, FieldError{"/terms_accepted", CodeTermsRequired})
	}
	if len(v) > 0 {
		return Account{}, LoginResult{}, v
	}
	p, err := g.pending(ctx, token)
	if err != nil {
		return Account{}, LoginResult{}, err
	}
	var orgPtr *string
	if org != "" {
		orgPtr = &org
	}
	var acc Account
	for range 3 {
		pseud, perr := NewPseudonym()
		if perr != nil {
			return Account{}, LoginResult{}, perr
		}
		acc, err = g.store.CreateGoogleAccount(ctx, NewAccount{
			ID: uuid.New(), Email: p.Email, Organisation: orgPtr, Pseudonym: pseud, TermsAcceptedAt: g.now().UTC(),
		}, p.Sub)
		if !errors.Is(err, errPseudonymUsed) {
			break
		}
	}
	if err == nil || errors.Is(err, ErrEmailTaken) || errors.Is(err, ErrGoogleAlreadyLinked) {
		_ = g.cache.Del(ctx, pendingGoogleKey(token))
	}
	if err != nil {
		return Account{}, LoginResult{}, err
	}
	tok, exp := g.sessions.Issue(acc.ID.String(), acc.SessionVersion, false)
	return acc, LoginResult{AccountID: acc.ID.String(), Token: tok, Expires: exp}, nil
}
