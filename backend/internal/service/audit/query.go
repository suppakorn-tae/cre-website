package audit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// ErrNotFound is returned when no audit entry has the requested id.
var ErrNotFound = errors.New("audit: entry not found")

// Filter selects audit entries. Nil fields do not filter. From is inclusive
// and To exclusive. Page starts at 1.
type Filter struct {
	AdminID    *uuid.UUID
	Action     *Action
	TargetType *string
	TargetID   *string
	From, To   *time.Time
	Page       int
	PageSize   int
}

// Summary is one row of the list.
type Summary struct {
	ID         int64
	OccurredAt time.Time
	AdminID    uuid.UUID
	AdminEmail *string // nil once the admin account is anonymised
	Action     Action
	TargetType string
	TargetID   string
}

// Detail is one entry with its old and new values.
type Detail struct {
	Summary
	OldValue  json.RawMessage // nil when the row stored SQL NULL
	NewValue  json.RawMessage
	RequestID string
	IPAddress *netip.Addr
}

// Page is a page of summaries with the total number of matches.
type Page struct {
	Items    []Summary
	Page     int
	PageSize int
	Total    int64
}

// Reader is the read side of the audit log. It has no write methods and the
// application role cannot update or delete audit rows anyway.
type Reader struct{ db dal.DBTX }

// NewReader returns a Reader on db.
func NewReader(db dal.DBTX) *Reader { return &Reader{db: db} }

// List returns the entries matching f, newest first.
func (r *Reader) List(ctx context.Context, f Filter) (Page, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 20
	}
	q := sqlc.New(r.db)
	total, err := q.CountAuditLog(ctx, countParams(f))
	if err != nil {
		return Page{}, fmt.Errorf("audit: count: %w", err)
	}
	p := listParams(f)
	p.PageSize = int32(f.PageSize)                  //nolint:gosec // bounded by the handler (max 100)
	p.PageOffset = int32((f.Page - 1) * f.PageSize) //nolint:gosec // same bound
	rows, err := q.ListAuditLog(ctx, p)
	if err != nil {
		return Page{}, fmt.Errorf("audit: list: %w", err)
	}
	items := make([]Summary, 0, len(rows))
	for _, x := range rows {
		items = append(items, summary(x.ID, x.OccurredAt, x.AdminID, x.AdminEmail, x.Action, x.TargetType, x.TargetID))
	}
	return Page{Items: items, Page: f.Page, PageSize: f.PageSize, Total: total}, nil
}

// Get returns one entry with its old and new values.
func (r *Reader) Get(ctx context.Context, id int64) (Detail, error) {
	x, err := sqlc.New(r.db).GetAuditEntry(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, ErrNotFound
	}
	if err != nil {
		return Detail{}, fmt.Errorf("audit: get: %w", err)
	}
	return Detail{
		Summary:   summary(x.ID, x.OccurredAt, x.AdminID, x.AdminEmail, x.Action, x.TargetType, x.TargetID),
		OldValue:  x.OldValue,
		NewValue:  x.NewValue,
		RequestID: x.RequestID,
		IPAddress: x.IpAddress,
	}, nil
}

func summary(id int64, at time.Time, admin uuid.UUID, email string, a sqlc.AuditAction, tt, tid string) Summary {
	s := Summary{ID: id, OccurredAt: at, AdminID: admin, Action: Action(a), TargetType: tt, TargetID: tid}
	if email != "" {
		s.AdminEmail = &email
	}
	return s
}

func listParams(f Filter) sqlc.ListAuditLogParams {
	p := sqlc.ListAuditLogParams{FromAt: f.From, ToAt: f.To}
	if f.AdminID != nil {
		p.AdminID = uuid.NullUUID{UUID: *f.AdminID, Valid: true}
	}
	if f.Action != nil {
		p.Action = sqlc.NullAuditAction{AuditAction: sqlc.AuditAction(*f.Action), Valid: true}
	}
	if f.TargetType != nil {
		p.TargetType = pgtype.Text{String: *f.TargetType, Valid: true}
	}
	if f.TargetID != nil {
		p.TargetID = pgtype.Text{String: *f.TargetID, Valid: true}
	}
	return p
}

func countParams(f Filter) sqlc.CountAuditLogParams {
	l := listParams(f)
	return sqlc.CountAuditLogParams{
		AdminID: l.AdminID, Action: l.Action, TargetType: l.TargetType,
		TargetID: l.TargetID, FromAt: l.FromAt, ToAt: l.ToAt,
	}
}
