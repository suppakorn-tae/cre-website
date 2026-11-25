package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func TestGooglePGStore(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	db := testutil.NewDB(t)
	ctx := context.Background()
	s := auth.GooglePGStore{DB: db}
	a := testutil.NewAccount(t, db)
	b := testutil.NewAccount(t, db)

	if _, err := s.BySub(ctx, "g-1"); !errors.Is(err, auth.ErrLoginNoAccount) {
		t.Fatalf("unknown sub: %v", err)
	}
	if ok, err := s.LinkSub(ctx, a.ID, "g-1"); !ok || err != nil {
		t.Fatalf("link: %v %v", ok, err)
	}
	got, err := s.BySub(ctx, "g-1")
	if err != nil || got.ID != a.ID || !got.HasGoogle || !got.HasPassword || got.Status != "active" {
		t.Fatalf("by sub: %+v %v", got, err)
	}
	if got, err := s.ByEmail(ctx, b.Email); err != nil || got.ID != b.ID || got.HasGoogle {
		t.Fatalf("by email: %+v %v", got, err)
	}
	// The Google id is unique across accounts.
	if _, err := s.LinkSub(ctx, b.ID, "g-1"); !errors.Is(err, auth.ErrGoogleAlreadyLinked) {
		t.Fatalf("second account: %v", err)
	}
	// An account keeps its first Google id.
	if ok, err := s.LinkSub(ctx, a.ID, "g-2"); ok || err != nil {
		t.Fatalf("relink: %v %v", ok, err)
	}

	_, err = s.CreateGoogleAccount(ctx, auth.NewAccount{
		ID: uuid.New(), Email: "new@example.test", Pseudonym: "user-google1", TermsAcceptedAt: time.Now(),
	}, "g-3")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if got, err := s.BySub(ctx, "g-3"); err != nil || got.HasPassword || !got.HasGoogle {
		t.Fatalf("created account: %+v %v", got, err)
	}
	if _, err := s.CreateGoogleAccount(ctx, auth.NewAccount{
		ID: uuid.New(), Email: "other@example.test", Pseudonym: "user-google2", TermsAcceptedAt: time.Now(),
	}, "g-3"); !errors.Is(err, auth.ErrGoogleAlreadyLinked) {
		t.Fatalf("duplicate sub: %v", err)
	}
	if _, err := s.CreateGoogleAccount(ctx, auth.NewAccount{
		ID: uuid.New(), Email: b.Email, Pseudonym: "user-google3", TermsAcceptedAt: time.Now(),
	}, "g-4"); !errors.Is(err, auth.ErrEmailTaken) {
		t.Fatalf("duplicate e-mail: %v", err)
	}
}

func TestGooglePGStoreUnlink(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	db := testutil.NewDB(t)
	ctx := context.Background()
	s := auth.GooglePGStore{DB: db}
	a := testutil.NewAccount(t, db)
	if ok, err := s.LinkSub(ctx, a.ID, "g-1"); !ok || err != nil {
		t.Fatalf("link: %v %v", ok, err)
	}
	only, err := s.CreateGoogleAccount(ctx, auth.NewAccount{
		ID: uuid.New(), Email: "only@example.test", Pseudonym: "user-google1", TermsAcceptedAt: time.Now(),
	}, "g-2")
	if err != nil {
		t.Fatal(err)
	}
	// Unlink needs a password: the Google-only account keeps its id.
	if ok, err := s.UnlinkSub(ctx, only.ID.String()); ok || err != nil {
		t.Fatalf("unlink google-only: %v %v", ok, err)
	}
	if ok, err := s.UnlinkSub(ctx, a.ID); !ok || err != nil {
		t.Fatalf("unlink: %v %v", ok, err)
	}
	if got, err := s.ByID(ctx, a.ID); err != nil || got.HasGoogle || !got.HasPassword {
		t.Fatalf("after unlink: %+v %v", got, err)
	}
}
