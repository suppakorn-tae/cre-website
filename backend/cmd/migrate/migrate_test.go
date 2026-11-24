package main

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const wantEnums = 14

var wantTables = []string{
	"locale", "dimension", "dimension_text", "factor", "factor_text",
	"indicator", "indicator_text", "ri_e_option", "ri_e_option_text",
	"impact_table", "advice_item", "advice_item_text",
}

func startPostgres(t *testing.T) (url string, conn *pgx.Conn) {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("cre"),
		tcpostgres.WithUsername("cre"),
		tcpostgres.WithPassword("cre"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").
			WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("start postgres: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })

	url, err = ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	conn, err = pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close(ctx) })
	return url, conn
}

func count(t *testing.T, conn *pgx.Conn, query string) int {
	t.Helper()
	var n int
	if err := conn.QueryRow(context.Background(), query).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func schemaCounts(t *testing.T, conn *pgx.Conn) (enums, tables int) {
	enums = count(t, conn, `SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public' AND t.typtype = 'e'`)
	tables = count(t, conn, `SELECT count(*) FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name <> 'schema_migrations'`)
	return enums, tables
}

func TestUpDownUp(t *testing.T) {
	url, conn := startPostgres(t)

	for i, cmd := range []string{"up", "down", "up"} {
		if err := run([]string{cmd}, url); err != nil {
			t.Fatalf("step %d (%s): %v", i, cmd, err)
		}
		enums, tables := schemaCounts(t, conn)
		if cmd == "down" {
			if enums != 0 || tables != 0 {
				t.Fatalf("after down: %d enums, %d tables left", enums, tables)
			}
			continue
		}
		if enums != wantEnums || tables != len(wantTables) {
			t.Fatalf("after up: %d enums (want %d), %d tables (want %d)",
				enums, wantEnums, tables, len(wantTables))
		}
	}
	for _, tbl := range wantTables {
		if n := count(t, conn, `SELECT count(*) FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = '`+tbl+`'`); n != 1 {
			t.Errorf("table %s missing", tbl)
		}
	}
}

func TestConstraints(t *testing.T) {
	url, conn := startPostgres(t)
	if err := run([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	mustExec := func(sql string, args ...any) {
		t.Helper()
		if _, err := conn.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	mustExec(`INSERT INTO locale VALUES ('th', true), ('en', false)`)
	mustExec(`INSERT INTO dimension VALUES ('EC', 1)`)
	mustExec(`INSERT INTO factor VALUES ('EC-MG', 'EC', 1)`)

	ind := func(code, f, dir string, a, b, c, d, e any) error {
		_, err := conn.Exec(ctx, `INSERT INTO indicator (code, factor_code, f_code, direction, a, b, c, d, e)
			VALUES ($1, 'EC-MG', $2, $3::indicator_direction, $4, $5, $6, $7, $8)`,
			code, f, dir, a, b, c, d, e)
		return err
	}
	check := func(err error, want string) {
		t.Helper()
		pe, ok := err.(*pgconn.PgError)
		if want == "" {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			return
		}
		if !ok || pe.ConstraintName != want {
			t.Fatalf("want constraint %s, got %v", want, err)
		}
	}

	check(ind("I1", "F1", "normal", 1, 2, 3, 4, 5), "")
	check(ind("I2", "F2", "normal", 1, 2, 3, nil, nil), "")
	check(ind("I3", "F3", "normal", nil, nil, 3, 4, 5), "")
	check(ind("I4", "F4", "inverse", 5, 4, 3, 2, 1), "")
	check(ind("I5", "F5", "normal", 1, nil, 3, 4, 5), "indicator_threshold_pattern_ck")
	check(ind("I6", "F6", "normal", 1, 2, nil, 4, 5), "indicator_threshold_pattern_ck")
	check(ind("I7", "F7", "normal", 1, 2, 3, 4, nil), "indicator_threshold_pattern_ck")
	check(ind("I8", "F8", "normal", nil, nil, nil, nil, nil), "indicator_threshold_pattern_ck")
	check(ind("I9", "F9", "normal", 1, 2, 2, 4, 5), "indicator_threshold_order_ck")
	check(ind("I10", "F10", "inverse", 1, 2, 3, 4, 5), "indicator_threshold_order_ck")
	check(ind("I11", "F11", "normal", -1, 2, 3, 4, 5), "indicator_threshold_nonneg_ck")

	// impact_table: all five set and strictly increasing.
	_, err := conn.Exec(ctx, `INSERT INTO impact_table (code, a, b, c, d, e) VALUES ('RI_C', 0, 1, 2, 3, 3)`)
	check(err, "impact_table_order_ck")
	_, err = conn.Exec(ctx, `INSERT INTO impact_table (code, a, b, c, d, e) VALUES ('RI_C', 0, 1, 2, 3, 4)`)
	check(err, "")

	// ri_e_option: code A-I, score 1-5.
	_, err = conn.Exec(ctx, `INSERT INTO ri_e_option VALUES ('J', 1, false)`)
	check(err, "ri_e_option_code_ck")
	_, err = conn.Exec(ctx, `INSERT INTO ri_e_option VALUES ('A', 6, true)`)
	check(err, "ri_e_option_score_ck")

	// locale: code shape and a single default.
	_, err = conn.Exec(ctx, `INSERT INTO locale VALUES ('EN', false)`)
	check(err, "locale_code_ck")
	_, err = conn.Exec(ctx, `INSERT INTO locale VALUES ('fr', true)`)
	check(err, "locale_default_ux")

	// advice_item: position 1-5, deferrable unique, cascade only to text.
	adv := func(id string, pos int) error {
		_, err := conn.Exec(ctx, `INSERT INTO advice_item (id, indicator_code, list, position)
			VALUES ($1, 'I1', 'RL', $2)`, id, pos)
		return err
	}
	const id1 = "00000000-0000-7000-8000-000000000001"
	const id2 = "00000000-0000-7000-8000-000000000002"
	check(adv(id1, 0), "advice_item_position_ck")
	check(adv(id1, 6), "advice_item_position_ck")
	check(adv(id1, 1), "")
	check(adv(id2, 2), "")
	// Swap positions inside one transaction: allowed only because the unique is deferrable.
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE advice_item SET position = 3 - position`); err != nil {
		t.Fatalf("swap: %v", err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatalf("commit swap: %v", err)
	}
	check(adv("00000000-0000-7000-8000-000000000003", 1), "advice_item_position_uq")

	_, err = conn.Exec(ctx, `INSERT INTO advice_item_text VALUES ($1, 'th', '   ')`, id1)
	check(err, "advice_item_text_not_blank_ck")
	mustExec(`INSERT INTO advice_item_text VALUES ($1, 'th', 'text')`, id1)

	// Restrict: indicator and locale cannot be deleted while referenced.
	if _, err = conn.Exec(ctx, `DELETE FROM indicator WHERE code = 'I1'`); err == nil {
		t.Fatal("deleting a referenced indicator must fail")
	}
	if _, err = conn.Exec(ctx, `DELETE FROM locale WHERE code = 'th'`); err == nil {
		t.Fatal("deleting a referenced locale must fail")
	}
	// Cascade: deleting the item removes its text.
	mustExec(`DELETE FROM advice_item WHERE id = $1`, id1)
	if n := count(t, conn, `SELECT count(*) FROM advice_item_text`); n != 0 {
		t.Fatalf("advice_item_text rows after cascade: %d", n)
	}
}

func TestRunUsage(t *testing.T) {
	if err := run(nil, "x"); err == nil {
		t.Error("no command must fail")
	}
	if err := run([]string{"up"}, ""); err == nil {
		t.Error("missing DATABASE_URL must fail")
	}
}
