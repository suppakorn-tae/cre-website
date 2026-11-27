package main

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// connectAsApp opens a connection to the database at ownerURL as cre_app.
func connectAsApp(ctx context.Context, ownerURL, password string) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig(ownerURL)
	if err != nil {
		return nil, err
	}
	cfg.User, cfg.Password = appRole, password
	return pgx.ConnectConfig(ctx, cfg)
}

func TestSetAppPassword(t *testing.T) {
	url, conn := startPostgres(t)
	ctx := context.Background()

	// Without APP_DB_PASSWORD the role gets no password: nobody can log in.
	if err := runAll([]string{"up"}, url, ""); err != nil {
		t.Fatal(err)
	}
	if c, err := connectAsApp(ctx, url, ""); err == nil {
		_ = c.Close(ctx)
		t.Fatal("cre_app connected without a password")
	}

	// A password with quotes and a backslash is stored as given.
	for _, pw := range []string{`it's-a'; DROP TABLE account; --`, `back\slash'"x`, "plain-pw"} {
		if err := runAll([]string{"up"}, url, pw); err != nil {
			t.Fatalf("password %q: %v", pw, err)
		}
		c, err := connectAsApp(ctx, url, pw)
		if err != nil {
			t.Fatalf("password %q: connect as cre_app: %v", pw, err)
		}
		var who string
		if err := c.QueryRow(ctx, `SELECT current_user`).Scan(&who); err != nil || who != appRole {
			t.Fatalf("current_user = %q, %v", who, err)
		}
		_ = c.Close(ctx)
	}

	// The last password replaced the earlier ones, and a wrong one fails.
	if c, err := connectAsApp(ctx, url, `it's-a'; DROP TABLE account; --`); err == nil {
		_ = c.Close(ctx)
		t.Fatal("an old password still works")
	}
	if n := count(t, conn, `SELECT count(*) FROM information_schema.tables WHERE table_name = 'account'`); n != 1 {
		t.Fatalf("account table count = %d, the password was executed as SQL", n)
	}
}

func TestSetAppPasswordErrorHidesPassword(t *testing.T) {
	url, _ := startPostgres(t)
	// No migration ran, so cre_app does not exist and ALTER ROLE fails.
	pw := "s3cret-pw'x"
	err := setAppPassword(context.Background(), url, pw)
	if err == nil {
		t.Fatal("want an error when the role does not exist")
	}
	if strings.Contains(err.Error(), pw) {
		t.Fatalf("error leaks the password: %v", err)
	}
}

func TestRunAllDownSkipsPassword(t *testing.T) {
	url, _ := startPostgres(t)
	if err := runAll([]string{"up"}, url, ""); err != nil {
		t.Fatal(err)
	}
	// "down" must not try to set a password on a role it is about to drop.
	if err := runAll([]string{"down"}, url, "pw"); err != nil {
		t.Fatal(err)
	}
}
