package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type noSessions struct{ bumped []string }

func (n *noSessions) BumpVersion(_ context.Context, id string) (int, error) {
	n.bumped = append(n.bumped, id)
	return 2, nil
}
func (*noSessions) Forget(context.Context, string) error { return nil }

func ctxFor(actor string) context.Context {
	ctx := log.WithRequestID(context.Background(), "req-1")
	ctx = audit.WithAdmin(ctx, uuid.MustParse(actor))
	return audit.WithClientIP(ctx, "198.51.100.7")
}

func TestLastActiveAdminCannotBeChanged(t *testing.T) {
	db := testutil.NewDB(t)
	sole := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
	// The actor is a deactivated admin, so the target is the last active one.
	actor := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
	if _, err := db.Exec(context.Background(),
		`UPDATE account SET status = 'deactivated' WHERE id = $1`, actor.ID); err != nil {
		t.Fatal(err)
	}
	s := admin.NewUserService(db, audit.New(audit.NewRepository()), &noSessions{})
	ctx := ctxFor(actor.ID)
	actorID, soleID := uuid.MustParse(actor.ID), uuid.MustParse(sole.ID)

	if _, err := s.ChangeRole(ctx, actorID, soleID, "user"); !errors.Is(err, admin.ErrLastAdmin) {
		t.Errorf("demote = %v, want ErrLastAdmin", err)
	}
	if _, err := s.Deactivate(ctx, actorID, soleID); !errors.Is(err, admin.ErrLastAdmin) {
		t.Errorf("deactivate = %v, want ErrLastAdmin", err)
	}
	if err := s.Delete(ctx, actorID, soleID); !errors.Is(err, admin.ErrLastAdmin) {
		t.Errorf("delete = %v, want ErrLastAdmin", err)
	}
	var n int
	_ = db.QueryRow(context.Background(), `SELECT count(*) FROM audit_log`).Scan(&n)
	if n != 0 {
		t.Errorf("%d audit rows written for refused actions", n)
	}
}

func TestSessionBumpedOnDeactivateRoleAndDelete(t *testing.T) {
	db := testutil.NewDB(t)
	actor := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Role = "admin" })
	u := testutil.NewAccount(t, db)
	ss := &noSessions{}
	s := admin.NewUserService(db, audit.New(audit.NewRepository()), ss)
	ctx := ctxFor(actor.ID)
	actorID, id := uuid.MustParse(actor.ID), uuid.MustParse(u.ID)

	if _, err := s.ChangeRole(ctx, actorID, id, "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeRole(ctx, actorID, id, "admin"); err != nil { // no-op: no second bump or audit row
		t.Fatal(err)
	}
	if _, err := s.Deactivate(ctx, actorID, id); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, actorID, id); err != nil {
		t.Fatal(err)
	}
	if len(ss.bumped) != 3 {
		t.Errorf("bumps = %d, want 3", len(ss.bumped))
	}
	var n int
	_ = db.QueryRow(context.Background(), `SELECT count(*) FROM audit_log`).Scan(&n)
	if n != 3 {
		t.Errorf("audit rows = %d, want 3", n)
	}
}
