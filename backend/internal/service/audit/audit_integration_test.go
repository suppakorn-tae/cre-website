package audit_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers pgx5://
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/migrations"
)

// setup migrates a fresh database as the owner and returns a pool connected
// as the application role (cre_app) plus an admin account id.
func setup(t *testing.T) (app *pgxpool.Pool, admin uuid.UUID) {
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

	ownerURL, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		t.Fatal(err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, "pgx5://"+strings.TrimPrefix(ownerURL, "postgres://"))
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Up(); err != nil {
		t.Fatalf("migrate up: %v", err)
	}
	_, _ = m.Close()

	owner, err := pgx.Connect(ctx, ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = owner.Close(ctx) })
	admin = uuid.New()
	if _, err := owner.Exec(ctx, `INSERT INTO account (id, email, password_hash, role, pseudonym, terms_accepted_at)
		VALUES ($1, 'admin@example.test', 'x', 'admin', 'p-admin', now())`, admin); err != nil {
		t.Fatalf("insert admin: %v", err)
	}
	if _, err := owner.Exec(ctx, `ALTER ROLE cre_app PASSWORD 'app'`); err != nil {
		t.Fatal(err)
	}

	cfg, err := pgxpool.ParseConfig(ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.User, cfg.ConnConfig.Password = "cre_app", "app"
	app, err = pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Close)
	return app, admin
}

func reqCtx(admin uuid.UUID, reqID, ip string) context.Context {
	ctx := log.WithRequestID(context.Background(), reqID)
	ctx = audit.WithAdmin(ctx, admin)
	return audit.WithClientIP(ctx, ip)
}

func rowCount(t *testing.T, db *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), `SELECT count(*) FROM audit_log`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRecordCommitAndRollback(t *testing.T) {
	db, admin := setup(t)
	svc := audit.New(audit.NewRepository())
	ctx := reqCtx(admin, "req-1", "203.0.113.7")
	entry := audit.Entry{
		Action: audit.AdviceEdit, TargetType: "indicator", TargetID: "EC-MG-1",
		Old: map[string]any{"text": "a"}, New: map[string]any{"text": "b"},
	}

	errBoom := errors.New("boom")
	err := dal.WithTx(ctx, db, func(tx pgx.Tx) error {
		if err := svc.Record(ctx, tx, entry); err != nil {
			return err
		}
		return errBoom
	})
	if !errors.Is(err, errBoom) {
		t.Fatalf("want boom, got %v", err)
	}
	if n := rowCount(t, db); n != 0 {
		t.Fatalf("rollback left %d rows", n)
	}

	err = dal.WithTx(ctx, db, func(tx pgx.Tx) error { return svc.Record(ctx, tx, entry) })
	if err != nil {
		t.Fatal(err)
	}
	if n := rowCount(t, db); n != 1 {
		t.Fatalf("commit left %d rows, want 1", n)
	}

	var (
		gotAdmin             uuid.UUID
		action, typ, id, rid string
		ip                   string
		oldV, newV           string
	)
	err = db.QueryRow(ctx, `SELECT admin_id, action::text, target_type, target_id, request_id,
		host(ip_address), old_value->>'text', new_value->>'text' FROM audit_log`).
		Scan(&gotAdmin, &action, &typ, &id, &rid, &ip, &oldV, &newV)
	if err != nil {
		t.Fatal(err)
	}
	if gotAdmin != admin || action != "advice_edit" || typ != "indicator" || id != "EC-MG-1" ||
		rid != "req-1" || ip != "203.0.113.7" || oldV != "a" || newV != "b" {
		t.Fatalf("unexpected row: %v %s %s %s %s %s %s %s", gotAdmin, action, typ, id, rid, ip, oldV, newV)
	}
}

func TestRecordNilValuesAndIPv6(t *testing.T) {
	db, admin := setup(t)
	svc := audit.New(audit.NewRepository())
	ctx := reqCtx(admin, "req-2", "2001:db8::1")
	err := dal.WithTx(ctx, db, func(tx pgx.Tx) error {
		return svc.Record(ctx, tx, audit.Entry{Action: audit.ExportDownload, TargetType: "export_job", TargetID: "j1"})
	})
	if err != nil {
		t.Fatal(err)
	}
	var nulls bool
	var ip string
	if err := db.QueryRow(ctx, `SELECT old_value IS NULL AND new_value IS NULL, host(ip_address) FROM audit_log`).
		Scan(&nulls, &ip); err != nil {
		t.Fatal(err)
	}
	if !nulls || ip != "2001:db8::1" {
		t.Fatalf("nulls=%v ip=%s", nulls, ip)
	}
}

func TestRecordRequiresRequestContext(t *testing.T) {
	db, admin := setup(t)
	svc := audit.New(audit.NewRepository())
	entry := audit.Entry{Action: audit.UserDelete, TargetType: "account", TargetID: "x"}

	full := reqCtx(admin, "req-3", "198.51.100.1")
	cases := map[string]struct {
		ctx  context.Context
		want error
	}{
		"no admin":      {audit.WithClientIP(log.WithRequestID(context.Background(), "r"), "198.51.100.1"), audit.ErrNoAdmin},
		"no request id": {audit.WithClientIP(audit.WithAdmin(context.Background(), admin), "198.51.100.1"), audit.ErrNoRequestID},
		"no ip":         {log.WithRequestID(audit.WithAdmin(context.Background(), admin), "r"), audit.ErrNoClientIP},
		"bad ip":        {reqCtx(admin, "r", "not-an-ip"), audit.ErrNoClientIP},
	}
	for name, c := range cases {
		err := dal.WithTx(full, db, func(tx pgx.Tx) error { return svc.Record(c.ctx, tx, entry) })
		if !errors.Is(err, c.want) {
			t.Errorf("%s: got %v, want %v", name, err, c.want)
		}
	}
	if n := rowCount(t, db); n != 0 {
		t.Fatalf("%d rows written", n)
	}
}

func TestAppRoleCannotModifyAuditLog(t *testing.T) {
	db, admin := setup(t)
	svc := audit.New(audit.NewRepository())
	ctx := reqCtx(admin, "req-4", "198.51.100.2")
	err := dal.WithTx(ctx, db, func(tx pgx.Tx) error {
		return svc.Record(ctx, tx, audit.Entry{Action: audit.UserDeactivate, TargetType: "account", TargetID: "u"})
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{`UPDATE audit_log SET target_id = 'z'`, `DELETE FROM audit_log`, `TRUNCATE audit_log`} {
		if _, err := db.Exec(ctx, q); err == nil {
			t.Errorf("%s succeeded for app role", q)
		}
	}
}
