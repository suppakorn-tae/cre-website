package testutil_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

// sqlState returns the SQLSTATE of err, or "" when err is not a server error.
func sqlState(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

const permissionDenied = "42501"

// TestAppRoleGrants runs as cre_app, the role api and worker use in
// production: the audit log is append-only and ordinary app writes work.
func TestAppRoleGrants(t *testing.T) {
	owner := testutil.NewOwnerDB(t)
	app := testutil.NewAppPool(t, owner)
	ctx := context.Background()

	var who string
	if err := app.QueryRow(ctx, `SELECT current_user`).Scan(&who); err != nil || who != testutil.AppRole {
		t.Fatalf("current_user = %q, %v", who, err)
	}

	// An app write through the ordinary fixtures: account, project, version.
	admin := testutil.NewAccount(t, app, func(a *testutil.Account) { a.Role = "admin" })
	p := testutil.NewProject(t, app, admin.ID)
	testutil.NewVersionWithSnapshot(t, app, p.ID)

	// Audit log: SELECT and INSERT work (the identity column needs no
	// separate sequence grant).
	var id int64
	err := app.QueryRow(ctx, `INSERT INTO audit_log (admin_id, action, target_type, target_id, request_id)
		VALUES ($1, 'advice_edit', 'indicator', 'I1', 'req-1') RETURNING id`, admin.ID).Scan(&id)
	if err != nil {
		t.Fatalf("insert audit_log: %v", err)
	}
	var n int
	if err := app.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE id = $1`, id).Scan(&n); err != nil || n != 1 {
		t.Fatalf("select audit_log: n=%d err=%v", n, err)
	}

	// Everything else on audit_log is refused.
	for _, q := range []string{
		`UPDATE audit_log SET target_id = 'x'`,
		`UPDATE audit_log SET target_id = 'x' WHERE id = 0`,
		`DELETE FROM audit_log`,
		`DELETE FROM audit_log WHERE id = 0`,
		`TRUNCATE audit_log`,
		`SELECT * FROM audit_log FOR UPDATE`,
	} {
		_, err := app.Exec(ctx, q)
		if sqlState(err) != permissionDenied {
			t.Errorf("%s: want permission denied (42501), got %v", q, err)
		}
	}
	// The row is still there, unchanged.
	var target string
	if err := owner.QueryRow(ctx, `SELECT target_id FROM audit_log WHERE id = $1`, id).Scan(&target); err != nil || target != "I1" {
		t.Fatalf("audit row after refused writes: %q, %v", target, err)
	}

	// The role is not a superuser and cannot change the schema.
	var super bool
	if err := app.QueryRow(ctx, `SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user`).Scan(&super); err != nil || super {
		t.Fatalf("cre_app has elevated attributes: %v, %v", super, err)
	}
	if _, err := app.Exec(ctx, `DROP TABLE audit_log`); err == nil {
		t.Error("cre_app dropped audit_log")
	}
	if _, err := app.Exec(ctx, `CREATE TABLE sneaky (id int)`); sqlState(err) != permissionDenied {
		t.Errorf("create table: want 42501, got %v", err)
	}
}
