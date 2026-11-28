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

// query resolves audit_log through the search_path (schema public). The
// privilege check is true when any of UPDATE, DELETE or TRUNCATE is held.
const query = `
SELECT current_user::text,
       r.rolsuper,
       COALESCE((SELECT c.relowner = r.oid FROM pg_class c WHERE c.oid = to_regclass('audit_log')), false),
       COALESCE(has_table_privilege(current_user, to_regclass('audit_log'), 'UPDATE,DELETE,TRUNCATE'), false)
FROM pg_roles r
WHERE r.rolname = current_user`

// Check asks the database which role db is connected as. When that role is a
// superuser, owns audit_log or can modify it (UPDATE, DELETE or TRUNCATE),
// Check logs a warning that names the role, or, when strict is true, returns
// ErrOwnerRole instead. If the query itself fails, it warns and returns nil
// unless strict is true, so a database that is briefly down at startup does
// not stop the process. It never logs the connection string.
func Check(ctx context.Context, db Querier, strict bool, l *slog.Logger) error {
	var role string
	var super, owns, canModify bool
	if err := db.QueryRow(ctx, query).Scan(&role, &super, &owns, &canModify); err != nil {
		// pgxpool connects lazily, so the database may be briefly unreachable
		// at startup. Without strict mode that must not stop the process: the
		// api and worker started without any check before this one.
		if !strict {
			l.Warn("cannot check the database role, continuing", "error", err.Error())
			return nil
		}
		return fmt.Errorf("check database role: %w", err)
	}
	if !super && !owns && !canModify {
		return nil
	}
	if strict {
		return fmt.Errorf("%w: connected as %q (superuser=%t, owns audit_log=%t, can modify audit_log=%t); "+
			"set DATABASE_URL to the cre_app role, see the deploy runbook (Database roles)",
			ErrOwnerRole, role, super, owns, canModify)
	}
	l.Warn("database role is too powerful: the audit log is not append-only; "+
		"set DATABASE_URL to the cre_app role (see the deploy runbook, Database roles) "+
		"or set DB_REQUIRE_APP_ROLE=true to refuse to start",
		"role", role, "superuser", super, "owns_audit_log", owns, "can_modify_audit_log", canModify)
	return nil
}
