package auth

import (
	"context"
	"errors"
	"time"
)

// Intents of a signed-in account.
const (
	IntentLink   = "link"
	IntentReauth = "reauth"
)

// Callback results of link and reauth.
const (
	ResultLinked        = "linked"
	ResultReauthed      = "reauthenticated"
	ResultAlreadyLinked = "already_linked"
)

// ReauthTTL is how long a Google re-authentication allows account deletion.
const ReauthTTL = 5 * time.Minute

// Errors of link and unlink.
var (
	ErrSessionRequired  = errors.New("auth: google intent needs a session")
	ErrGoogleNotLinked  = errors.New("auth: no google account linked")
	ErrPasswordRequired = errors.New("auth: unlink needs a password on the account")
)

// ReauthKey marks a fresh Google re-authentication of the account; account
// deletion checks it.
func ReauthKey(accountID string) string { return "auth:reauth:" + accountID }

// StartForAccount starts a link or reauth for the signed-in accountID; the
// callback must arrive in the same account's session.
func (g *Google) StartForAccount(ctx context.Context, intent, accountID string) (authURL, state string, err error) {
	if intent != IntentLink && intent != IntentReauth {
		return "", "", ErrGoogleIntent
	}
	if accountID == "" {
		return "", "", ErrSessionRequired
	}
	if intent == IntentLink {
		acc, err := g.store.ByID(ctx, accountID)
		if err != nil {
			return "", "", err
		}
		if acc.HasGoogle {
			return "", "", ErrGoogleAlreadyLinked
		}
	}
	return g.begin(ctx, intent, accountID)
}

// link stores sub on the account unless another account has it (FR-09).
func (g *Google) link(ctx context.Context, accountID, sub string) (string, error) {
	other, err := g.store.BySub(ctx, sub)
	switch {
	case err == nil && other.ID == accountID:
		return ResultLinked, nil
	case err == nil:
		return ResultAlreadyLinked, nil
	case !errors.Is(err, ErrLoginNoAccount):
		return "", err
	}
	ok, err := g.store.LinkSub(ctx, accountID, sub)
	switch {
	case errors.Is(err, ErrGoogleAlreadyLinked):
		return ResultAlreadyLinked, nil
	case err != nil:
		return "", err
	case !ok:
		return ResultFailed, nil
	}
	return ResultLinked, nil
}

// reauth records a fresh sign-in when sub is the account's own Google id.
func (g *Google) reauth(ctx context.Context, accountID, sub string) (string, error) {
	acc, err := g.store.BySub(ctx, sub)
	if errors.Is(err, ErrLoginNoAccount) || (err == nil && acc.ID != accountID) {
		return ResultFailed, nil
	}
	if err != nil {
		return "", err
	}
	if err := g.cache.Set(ctx, ReauthKey(accountID), []byte("1"), ReauthTTL); err != nil {
		return "", err
	}
	return ResultReauthed, nil
}

// Unlink removes the Google id; a password must remain (FR-09).
func (g *Google) Unlink(ctx context.Context, accountID string) error {
	acc, err := g.store.ByID(ctx, accountID)
	if err != nil {
		return err
	}
	if !acc.HasGoogle {
		return ErrGoogleNotLinked
	}
	if !acc.HasPassword {
		return ErrPasswordRequired
	}
	ok, err := g.store.UnlinkSub(ctx, accountID)
	if err == nil && !ok {
		err = ErrGoogleNotLinked
	}
	return err
}
