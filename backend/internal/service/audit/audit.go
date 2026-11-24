// Package audit records admin actions in audit_log inside the caller's
// transaction, so the change and its audit row commit or roll back together.
package audit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
)

// Action mirrors the audit_action enum.
type Action string

// Audited admin actions.
const (
	UserRoleChange  Action = "user_role_change"
	UserDeactivate  Action = "user_deactivate"
	UserReactivate  Action = "user_reactivate"
	UserDelete      Action = "user_delete"
	AdviceEdit      Action = "advice_edit"
	RLThresholdEdit Action = "rl_threshold_edit"
	ImpactTableEdit Action = "impact_table_edit"
	ExportRequest   Action = "export_request"
	ExportDownload  Action = "export_download"
)

// Entry is one admin action. Old and New are marshalled to jsonb; nil stores
// SQL NULL.
type Entry struct {
	Action     Action
	TargetType string
	TargetID   string
	Old        any
	New        any
}

// Errors returned when the request context is incomplete.
var (
	ErrNoAdmin     = errors.New("audit: no admin id in context")
	ErrNoRequestID = errors.New("audit: no request id in context")
	ErrNoClientIP  = errors.New("audit: no valid client ip in context")
)

type (
	adminKey struct{}
	ipKey    struct{}
)

// WithAdmin returns ctx carrying the acting admin's account id.
func WithAdmin(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, adminKey{}, id)
}

// WithClientIP returns ctx carrying the client address resolved by RealIP.
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, ipKey{}, ip)
}

// Service is the Audit Service.
type Service struct{ repo *Repository }

// New returns a Service writing through repo.
func New(repo *Repository) *Service { return &Service{repo: repo} }

// Record writes e on tx. The admin id, request id and client IP come from
// ctx; a missing one is an error so no row lacks them. The caller owns tx and
// decides to commit or roll back.
func (s *Service) Record(ctx context.Context, tx dal.DBTX, e Entry) error {
	admin, ok := ctx.Value(adminKey{}).(uuid.UUID)
	if !ok || admin == uuid.Nil {
		return ErrNoAdmin
	}
	reqID := log.RequestID(ctx)
	if reqID == "" {
		return ErrNoRequestID
	}
	ipStr, _ := ctx.Value(ipKey{}).(string)
	ip, err := netip.ParseAddr(ipStr)
	if err != nil {
		return ErrNoClientIP
	}
	if e.Action == "" || e.TargetType == "" || e.TargetID == "" {
		return errors.New("audit: action, target type and target id are required")
	}
	oldV, err := marshal(e.Old)
	if err != nil {
		return fmt.Errorf("audit: marshal old value: %w", err)
	}
	newV, err := marshal(e.New)
	if err != nil {
		return fmt.Errorf("audit: marshal new value: %w", err)
	}
	return s.repo.Insert(ctx, tx, row{
		AdminID: admin, Action: e.Action, TargetType: e.TargetType, TargetID: e.TargetID,
		OldValue: oldV, NewValue: newV, RequestID: reqID, IP: ip.Unmap(),
	})
}

func marshal(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}
