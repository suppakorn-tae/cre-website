package auth_test

import (
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/account"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
)

// The Google callback sets the key that account deletion reads (IO-39).
func TestReauthKeyMatchesAccount(t *testing.T) {
	if auth.ReauthKey("x") != account.ReauthKey("x") || auth.ReauthTTL != account.ReauthTTL {
		t.Fatalf("reauth key or ttl differ: %q vs %q", auth.ReauthKey("x"), account.ReauthKey("x"))
	}
}
