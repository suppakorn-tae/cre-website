// Package dbrole checks, once at startup, that api and worker do not connect
// to Postgres as the schema owner or a superuser. Such a role can UPDATE and
// DELETE audit_log, which removes its append-only protection.
package dbrole

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
)

// Querier is the part of a pgx pool the check needs.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ErrOwnerRole is returned in strict mode when the role is too powerful.
var ErrOwnerRole = errors.New("database role can modify audit_log")

const query = `
SELECT current_user::text,
       r.rolsuper,
       COALESCE((SELECT c.relowner = r.oid FROM pg_class c WHERE c.oid = to_regclass('audit_log')), false),
       COALESCE(has_table_privilege(current_user, to_regclass('audit_log'), 'UPDATE'), false)
FROM pg_roles r
WHERE r.rolname = current_user`

// Check asks the database which role db is connected as. When that role is a
// superuser, owns audit_log or can UPDATE it, Check logs a warning that names
// the role, or, when strict is true, returns ErrOwnerRole instead. It never
// logs the connection string.
func Check(ctx context.Context, db Querier, strict bool, l *slog.Logger) error {
	var role string
	var super, owns, canUpdate bool
	if err := db.QueryRow(ctx, query).Scan(&role, &super, &owns, &canUpdate); err != nil {
		return fmt.Errorf("check database role: %w", err)
	}
	if !super && !owns && !canUpdate {
		return nil
	}
	if strict {
		return fmt.Errorf("%w: connected as %q (superuser=%t, owns audit_log=%t, can update audit_log=%t); "+
			"set DATABASE_URL to the cre_app role, see the deploy runbook (Database roles)",
			ErrOwnerRole, role, super, owns, canUpdate)
	}
	l.Warn("database role is too powerful: the audit log is not append-only; "+
		"set DATABASE_URL to the cre_app role (see the deploy runbook, Database roles) "+
		"or set DB_REQUIRE_APP_ROLE=true to refuse to start",
		"role", role, "superuser", super, "owns_audit_log", owns, "can_update_audit_log", canUpdate)
	return nil
}
