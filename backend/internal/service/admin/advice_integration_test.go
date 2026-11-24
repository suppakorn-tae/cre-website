package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type inval struct{ n int }

func (i *inval) Invalidate(context.Context) error { i.n++; return nil }

func setup(t *testing.T) (context.Context, *pgxpool.Pool, *svc.AdviceService, *inval, uuid.UUID, string) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	admin := uuid.MustParse(testutil.NewAccount(t, pool, func(a *testutil.Account) { a.Role = "admin" }).ID)
	ctx := log.WithRequestID(context.Background(), "req-1")
	ctx = audit.WithAdmin(ctx, admin)
	ctx = audit.WithClientIP(ctx, "203.0.113.7")
	var code string
	if err := pool.QueryRow(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code); err != nil {
		t.Fatal(err)
	}
	inv := &inval{}
	return ctx, pool, svc.NewAdviceService(pool, audit.New(audit.NewRepository()), inv), inv, admin, code
}

func th(s ...string) []svc.AdviceItem {
	out := make([]svc.AdviceItem, len(s))
	for i, x := range s {
		out[i] = svc.AdviceItem{Text: map[string]string{"th": x}}
	}
	return out
}

func TestReplaceReorderAuditAndInvalidate(t *testing.T) {
	ctx, pool, s, inv, admin, code := setup(t)

	if _, err := s.Replace(ctx, admin, code, "RL", th("ก", "ข", "ค")); err != nil {
		t.Fatal(err)
	}
	// Reorder the three items in one call.
	res, err := s.Replace(ctx, admin, code, "RL", th("ค", "ก", "ข"))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 3 || inv.n != 2 {
		t.Fatalf("items=%d invalidations=%d", len(res.Items), inv.n)
	}
	set, err := s.Get(ctx, code)
	if err != nil {
		t.Fatal(err)
	}
	got := set.Lists["RL"]
	if len(got) != 3 || got[0].Text["th"] != "ค" || got[1].Text["th"] != "ก" || got[2].Text["th"] != "ข" {
		t.Fatalf("RL = %+v", got)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE action = 'advice_edit' AND target_id = $1
		AND old_value IS NOT NULL AND new_value IS NOT NULL`, code).Scan(&n); err != nil || n != 2 {
		t.Fatalf("audit rows = %d err = %v", n, err)
	}
}

func TestReplaceRejectsAndRollsBack(t *testing.T) {
	ctx, _, s, inv, admin, code := setup(t)
	before, _ := s.Get(ctx, code)

	for _, items := range [][]svc.AdviceItem{nil, th("a", "b", "c", "d", "e", "f"), th("ok", " ")} {
		var v svc.ValidationError
		if _, err := s.Replace(ctx, admin, code, "RL", items); !errors.As(err, &v) {
			t.Fatalf("err = %v, want ValidationError", err)
		}
	}
	bad := []svc.AdviceItem{{Text: map[string]string{"th": "ok", "zz": "no such locale"}}}
	var v svc.ValidationError
	if _, err := s.Replace(ctx, admin, code, "RL", bad); !errors.As(err, &v) {
		t.Fatalf("unknown locale: err = %v", err)
	}
	if _, err := s.Replace(ctx, admin, "NOPE", "RL", th("ok")); !errors.Is(err, svc.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	after, _ := s.Get(ctx, code)
	if len(after.Lists["RL"]) != len(before.Lists["RL"]) || inv.n != 0 {
		t.Fatalf("list changed or invalidated: %d -> %d, inv=%d", len(before.Lists["RL"]), len(after.Lists["RL"]), inv.n)
	}
}
