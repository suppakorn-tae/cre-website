package audit_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

// explainer runs the real generated query as EXPLAIN and keeps the plan, so
// the test checks the SQL the service sends and not a copy of it.
type explainer struct {
	conn *pgx.Conn
	plan *strings.Builder
}

func (x explainer) Exec(ctx context.Context, q string, a ...any) (pgconn.CommandTag, error) {
	return x.conn.Exec(ctx, q, a...)
}

func (x explainer) QueryRow(ctx context.Context, q string, a ...any) pgx.Row {
	return x.conn.QueryRow(ctx, q, a...)
}

func (x explainer) Query(ctx context.Context, q string, a ...any) (pgx.Rows, error) {
	rows, err := x.conn.Query(ctx, "EXPLAIN "+q, a...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return nil, err
		}
		x.plan.WriteString(line + "\n")
	}
	return nil, errors.Join(rows.Err(), errors.New("explained"))
}

func TestListUsesAuditIndexes(t *testing.T) {
	ctx := context.Background()
	db := testutil.NewDB(t)
	a := testutil.NewAccount(t, db)
	b := testutil.NewAccount(t, db)
	// Enough rows for the planner to prefer an index over a scan.
	for _, id := range []string{a.ID, b.ID} {
		if _, err := db.Exec(ctx, `
			INSERT INTO audit_log (occurred_at, admin_id, action, target_type, target_id, request_id)
			SELECT now() - (g || ' minutes')::interval, $1, 'advice_edit', 'advice_item', 't' || (g % 500), 'r'
			FROM generate_series(1, 5000) g`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `ANALYZE audit_log`); err != nil {
		t.Fatal(err)
	}
	conn, err := db.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SET enable_seqscan = off`); err != nil {
		t.Fatal(err)
	}

	adminID := uuid.MustParse(a.ID)
	tt, tid := "advice_item", "t7"
	cases := []struct {
		name string
		f    audit.Filter
		idx  string
	}{
		{"no filter", audit.Filter{}, "audit_log_time_ix"},
		{"admin", audit.Filter{AdminID: &adminID}, "audit_log_admin_ix"},
		{"target", audit.Filter{TargetType: &tt, TargetID: &tid}, "audit_log_target_ix"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var plan strings.Builder
			r := audit.NewReader(explainer{conn: conn.Conn(), plan: &plan})
			if _, err := r.List(ctx, c.f); err == nil {
				t.Fatal("expected the explain stub to stop the query")
			}
			if !strings.Contains(plan.String(), c.idx) {
				t.Errorf("plan does not use %s:\n%s", c.idx, plan.String())
			}
			if strings.Contains(plan.String(), "Seq Scan on audit_log") {
				t.Errorf("plan scans audit_log:\n%s", plan.String())
			}
		})
	}
}

func TestGetNotFound(t *testing.T) {
	db := testutil.NewDB(t)
	if _, err := audit.NewReader(db).Get(context.Background(), 42); !errors.Is(err, audit.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
