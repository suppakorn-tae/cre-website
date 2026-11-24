package audit

import (
	"context"
	"net/netip"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
)

// Repository is the Audit Repository. It only inserts: the application role
// has INSERT and SELECT on audit_log, never UPDATE or DELETE.
type Repository struct{}

// NewRepository returns a Repository.
func NewRepository() *Repository { return &Repository{} }

type row struct {
	AdminID    uuid.UUID
	Action     Action
	TargetType string
	TargetID   string
	OldValue   []byte
	NewValue   []byte
	RequestID  string
	IP         netip.Addr
}

// insertSQL mirrors InsertAuditLog in dal/queries/audit_write.sql.
const insertSQL = `INSERT INTO audit_log
(admin_id, action, target_type, target_id, old_value, new_value, request_id, ip_address)
VALUES ($1, $2::audit_action, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`

// Insert writes one row on db (normally the caller's pgx.Tx).
func (*Repository) Insert(ctx context.Context, db dal.DBTX, r row) error {
	_, err := db.Exec(ctx, insertSQL,
		r.AdminID, string(r.Action), r.TargetType, r.TargetID,
		r.OldValue, r.NewValue, r.RequestID, r.IP)
	return err
}
