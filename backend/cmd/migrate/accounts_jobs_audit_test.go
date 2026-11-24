package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

const (
	adminID   = "00000000-0000-7000-8000-0000000000a1"
	unknownID = "00000000-0000-7000-8000-0000000000ff"
)

// pgErr returns the PostgreSQL error behind err, failing the test when there is none.
func pgErr(t *testing.T, err error) *pgconn.PgError {
	t.Helper()
	var pe *pgconn.PgError
	if !errors.As(err, &pe) {
		t.Fatalf("want a PostgreSQL error, got %v", err)
	}
	return pe
}

func TestCatalogueUpdatedByForeignKeys(t *testing.T) {
	url, conn := startPostgres(t)
	if err := run([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, sql := range []string{
		`INSERT INTO locale VALUES ('th', true)`,
		`INSERT INTO dimension VALUES ('EC', 1)`,
		`INSERT INTO factor VALUES ('EC-MG', 'EC', 1)`,
		`INSERT INTO indicator (code, factor_code, f_code, direction, a, b, c, d, e)
			VALUES ('I1', 'EC-MG', 'F1', 'normal', 1, 2, 3, 4, 5)`,
	} {
		if _, err := conn.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}

	cases := []struct{ name, constraint, sql string }{
		{"indicator", "indicator_updated_by_fk", `UPDATE indicator SET updated_by = $1 WHERE code = 'I1'`},
		{
			"impact_table", "impact_table_updated_by_fk",
			`INSERT INTO impact_table (code, a, b, c, d, e, updated_by) VALUES ('RI_C', 0, 1, 2, 3, 4, $1)`,
		},
		{
			"advice_item", "advice_item_updated_by_fk",
			`INSERT INTO advice_item (id, indicator_code, list, position, updated_by)
				VALUES ('00000000-0000-7000-8000-000000000001', 'I1', 'RL', 1, $1)`,
		},
	}
	for _, tc := range cases {
		_, err := conn.Exec(ctx, tc.sql, unknownID)
		pe := pgErr(t, err)
		if pe.Code != "23503" || pe.ConstraintName != tc.constraint {
			t.Errorf("%s: want foreign key %s, got %v", tc.name, tc.constraint, err)
		}
	}

	// A known account is accepted.
	if _, err := conn.Exec(ctx, `INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		VALUES ($1, 'admin@example.com', 'x', 'p-admin', now())`, adminID); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, cases[0].sql, adminID); err != nil {
		t.Fatalf("known account must be accepted: %v", err)
	}
}

func TestAuditLogAppendOnlyForApplicationRole(t *testing.T) {
	url, conn := startPostgres(t)
	if err := run([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := conn.Exec(ctx, `INSERT INTO account (id, email, password_hash, role, pseudonym, terms_accepted_at)
		VALUES ($1, 'admin@example.com', 'x', 'admin', 'p-admin', now())`, adminID); err != nil {
		t.Fatal(err)
	}

	if _, err := conn.Exec(ctx, `SET ROLE cre_app`); err != nil {
		t.Fatalf("set role: %v", err)
	}
	t.Cleanup(func() { _, _ = conn.Exec(ctx, `RESET ROLE`) })

	if _, err := conn.Exec(ctx, `INSERT INTO audit_log (admin_id, action, target_type, target_id, request_id)
		VALUES ($1, 'user_deactivate', 'account', 'x', 'req-1')`, adminID); err != nil {
		t.Fatalf("insert as cre_app: %v", err)
	}
	if n := count(t, conn, `SELECT count(*) FROM audit_log`); n != 1 {
		t.Fatalf("select as cre_app: %d rows, want 1", n)
	}

	for _, sql := range []string{
		`UPDATE audit_log SET target_id = 'y'`,
		`DELETE FROM audit_log`,
		`TRUNCATE audit_log`,
	} {
		_, err := conn.Exec(ctx, sql)
		if pe := pgErr(t, err); pe.Code != "42501" {
			t.Errorf("%s: want SQLSTATE 42501, got %v", sql, err)
		}
	}

	// The application role keeps ordinary access to other tables.
	if _, err := conn.Exec(ctx, `UPDATE account SET organisation = 'o'`); err != nil {
		t.Errorf("update account as cre_app: %v", err)
	}
	if _, err := conn.Exec(ctx, `RESET ROLE`); err != nil {
		t.Fatal(err)
	}
	if n := count(t, conn, `SELECT count(*) FROM audit_log`); n != 1 {
		t.Fatalf("audit rows after failed changes: %d, want 1", n)
	}
}

func TestAccountAndJobConstraints(t *testing.T) {
	url, conn := startPostgres(t)
	if err := run([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	want := func(err error, constraint string) {
		t.Helper()
		if constraint == "" {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			return
		}
		var pe *pgconn.PgError
		if !errors.As(err, &pe) || pe.ConstraintName != constraint {
			t.Fatalf("want constraint %s, got %v", constraint, err)
		}
	}
	exec := func(sql string, args ...any) error {
		_, err := conn.Exec(ctx, sql, args...)
		return err
	}

	// account: status and deleted_at agree; live accounts have e-mail and a sign-in method.
	want(exec(`INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		VALUES ($1, 'a@example.com', 'x', 'p1', now())`, adminID), "")
	want(exec(`INSERT INTO account (id, email, password_hash, status, pseudonym, terms_accepted_at)
		VALUES ('00000000-0000-7000-8000-0000000000a2', NULL, NULL, 'deleted', 'p2', now())`),
		"account_deleted_ck")
	want(exec(`INSERT INTO account (id, email, pseudonym, terms_accepted_at)
		VALUES ('00000000-0000-7000-8000-0000000000a3', 'b@example.com', 'p3', now())`),
		"account_live_ck")
	want(exec(`INSERT INTO account (id, email, password_hash, status, deleted_at, pseudonym, terms_accepted_at)
		VALUES ('00000000-0000-7000-8000-0000000000a4', 'c@example.com', 'x', 'deleted', now(), 'p4', now())`),
		"account_anonymised_ck")
	want(exec(`INSERT INTO account (id, email, password_hash, session_version, pseudonym, terms_accepted_at)
		VALUES ('00000000-0000-7000-8000-0000000000a5', 'd@example.com', 'x', 0, 'p5', now())`),
		"account_session_version_ck")
	// E-mail is case-insensitive.
	want(exec(`INSERT INTO account (id, email, password_hash, pseudonym, terms_accepted_at)
		VALUES ('00000000-0000-7000-8000-0000000000a6', 'A@EXAMPLE.COM', 'x', 'p6', now())`),
		"account_email_uq")

	// job: a queued job has no times; the subtype kind must match the job kind.
	const jobID = "00000000-0000-7000-8000-0000000000b1"
	want(exec(`INSERT INTO job (id, kind, requested_by, status, started_at)
		VALUES ($1, 'report', $2, 'queued', now())`, jobID, adminID), "job_times_ck")
	want(exec(`INSERT INTO job (id, kind, requested_by) VALUES ($1, 'report', $2)`, jobID, adminID), "")
	want(exec(`INSERT INTO export_job (job_id, scope, include_deleted) VALUES ($1, 'all', false)`, jobID),
		"export_job_job_fk")
}
