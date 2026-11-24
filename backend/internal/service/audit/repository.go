package audit

import (
	"context"
	"net/netip"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
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

// Insert writes one row on db (normally the caller's pgx.Tx) through the
// generated InsertAuditLog query.
func (*Repository) Insert(ctx context.Context, db dal.DBTX, r row) error {
	var ip *netip.Addr
	if r.IP.IsValid() {
		ip = &r.IP
	}
	return sqlc.New(db).InsertAuditLog(ctx, sqlc.InsertAuditLogParams{
		AdminID:    r.AdminID,
		Action:     sqlc.AuditAction(r.Action),
		TargetType: r.TargetType,
		TargetID:   r.TargetID,
		OldValue:   r.OldValue,
		NewValue:   r.NewValue,
		RequestID:  r.RequestID,
		IpAddress:  ip,
	})
}
