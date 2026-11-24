// Package admin holds the Admin Service: user management (UC-14). It only
// ever exposes per-user project and version counts, never their content
// (BR-21).
package admin

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

// Errors the handler maps to HTTP statuses.
var (
	ErrNotFound  = errors.New("admin: user not found")
	ErrSelf      = errors.New("admin: action on own account")
	ErrLastAdmin = errors.New("admin: last active admin")
	// ErrState means the account is not in a state the action needs, for
	// example reactivating an active user or changing a deleted one.
	ErrState = errors.New("admin: account state does not allow this")
)

// Sessions is the part of the session service used here.
type Sessions interface {
	BumpVersion(ctx context.Context, accountID string) (int, error)
	Forget(ctx context.Context, accountID string) error
}

// Auditor writes an audit row on the caller's transaction.
type Auditor interface {
	Record(ctx context.Context, tx dal.DBTX, e audit.Entry) error
}

// UserService manages accounts for admins.
type UserService struct {
	db       dal.Beginner
	read     dal.DBTX
	audit    Auditor
	sessions Sessions
}

// DB is a pool: it starts transactions and runs plain queries.
type DB interface {
	dal.Beginner
	dal.DBTX
}

// NewUserService builds a UserService. db is normally the pgx pool.
func NewUserService(db DB, a Auditor, s Sessions) *UserService {
	return &UserService{db: db, read: db, audit: a, sessions: s}
}

// User is one account as admins see it: counts only.
type User struct {
	ID           uuid.UUID
	Email        *string
	Organisation *string
	Role         string
	Status       string
	Password     bool
	Google       bool
	ProjectCount int
	VersionCount int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ListParams filters and pages the user list. Empty strings mean no filter.
type ListParams struct {
	Query    string
	Role     string
	Status   string
	Page     int
	PageSize int
}

// Page is one page of users with the total across all pages.
type Page struct {
	Items    []User
	Total    int
	Page     int
	PageSize int
}

// likePattern turns a search term into an ILIKE pattern, escaping wildcards.
func likePattern(q string) pgtype.Text {
	q = strings.TrimSpace(q)
	if q == "" {
		return pgtype.Text{}
	}
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return pgtype.Text{String: "%" + r.Replace(q) + "%", Valid: true}
}

func nullText(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

// List returns a page of users, newest first.
func (s *UserService) List(ctx context.Context, p ListParams) (Page, error) {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = 20
	}
	q := sqlc.New(s.read)
	like := likePattern(p.Query)
	role := sqlc.NullUserRole{UserRole: sqlc.UserRole(p.Role), Valid: p.Role != ""}
	status := sqlc.NullAccountStatus{AccountStatus: sqlc.AccountStatus(p.Status), Valid: p.Status != ""}
	total, err := q.AdminCountUsers(ctx, sqlc.AdminCountUsersParams{Q: like, Role: role, Status: status})
	if err != nil {
		return Page{}, fmt.Errorf("admin: count users: %w", err)
	}
	rows, err := q.AdminListUsers(ctx, sqlc.AdminListUsersParams{
		Q: like, Role: role, Status: status,
		PageLimit: int32(p.PageSize), PageOffset: int32((p.Page - 1) * p.PageSize), //nolint:gosec // bounded by the contract (page_size <= 100)
	})
	if err != nil {
		return Page{}, fmt.Errorf("admin: list users: %w", err)
	}
	out := Page{Items: make([]User, 0, len(rows)), Total: int(total), Page: p.Page, PageSize: p.PageSize}
	for _, r := range rows {
		out.Items = append(out.Items, User{
			ID: r.ID, Email: nullText(r.Email), Organisation: nullText(r.Organisation),
			Role: string(r.Role), Status: string(r.Status), Password: r.HasPassword, Google: r.HasGoogle,
			ProjectCount: int(r.ProjectCount), VersionCount: int(r.VersionCount),
			CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		})
	}
	return out, nil
}

// Get returns one user.
func (s *UserService) Get(ctx context.Context, id uuid.UUID) (User, error) {
	return get(ctx, s.read, id)
}

func get(ctx context.Context, db dal.DBTX, id uuid.UUID) (User, error) {
	r, err := sqlc.New(db).AdminGetUser(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("admin: get user: %w", err)
	}
	return User{
		ID: r.ID, Email: nullText(r.Email), Organisation: nullText(r.Organisation),
		Role: string(r.Role), Status: string(r.Status), Password: r.HasPassword, Google: r.HasGoogle,
		ProjectCount: int(r.ProjectCount), VersionCount: int(r.VersionCount),
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}, nil
}

// lock takes the row locks a change needs and returns the target. Active
// admins are locked first, in id order, then the target, so concurrent
// changes cannot deadlock or both pass the last-admin check.
func lock(ctx context.Context, q *sqlc.Queries, id uuid.UUID) (target sqlc.AdminLockAccountRow, activeAdmins int, err error) {
	admins, err := q.AdminLockActiveAdmins(ctx)
	if err != nil {
		return target, 0, fmt.Errorf("admin: lock admins: %w", err)
	}
	target, err = q.AdminLockAccount(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return target, 0, ErrNotFound
	}
	if err != nil {
		return target, 0, fmt.Errorf("admin: lock account: %w", err)
	}
	return target, len(admins), nil
}

func isActiveAdmin(t sqlc.AdminLockAccountRow) bool {
	return t.Role == sqlc.UserRoleAdmin && t.Status == sqlc.AccountStatusActive
}

// ChangeRole sets the role of a user. Another admin must do it, and the last
// active admin cannot be demoted. The target's sessions end.
func (s *UserService) ChangeRole(ctx context.Context, actor, id uuid.UUID, role string) (User, error) {
	if role != string(sqlc.UserRoleUser) && role != string(sqlc.UserRoleAdmin) {
		return User{}, fmt.Errorf("admin: invalid role %q", role)
	}
	var out User
	changed := false
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		if actor == id {
			return ErrSelf
		}
		q := sqlc.New(tx)
		t, admins, err := lock(ctx, q, id)
		if err != nil {
			return err
		}
		if t.Status == sqlc.AccountStatusDeleted {
			return ErrState
		}
		if string(t.Role) != role {
			if isActiveAdmin(t) && admins <= 1 {
				return ErrLastAdmin
			}
			if err := q.AdminSetRole(ctx, sqlc.AdminSetRoleParams{Role: sqlc.UserRole(role), ID: id}); err != nil {
				return fmt.Errorf("admin: set role: %w", err)
			}
			if err := s.audit.Record(ctx, tx, audit.Entry{
				Action: audit.UserRoleChange, TargetType: "account", TargetID: id.String(),
				Old: map[string]string{"role": string(t.Role)}, New: map[string]string{"role": role},
			}); err != nil {
				return err
			}
			changed = true
		}
		out, err = get(ctx, tx, id)
		return err
	})
	if err != nil {
		return User{}, err
	}
	if changed {
		if err := s.endSessions(ctx, id); err != nil {
			return User{}, err
		}
	}
	return out, nil
}

// Deactivate blocks an active user from signing in and ends their sessions.
func (s *UserService) Deactivate(ctx context.Context, actor, id uuid.UUID) (User, error) {
	var out User
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		if actor == id {
			return ErrSelf
		}
		q := sqlc.New(tx)
		t, admins, err := lock(ctx, q, id)
		if err != nil {
			return err
		}
		if t.Status != sqlc.AccountStatusActive {
			return ErrState
		}
		if isActiveAdmin(t) && admins <= 1 {
			return ErrLastAdmin
		}
		if err := q.AdminSetStatus(ctx, sqlc.AdminSetStatusParams{Status: sqlc.AccountStatusDeactivated, ID: id}); err != nil {
			return fmt.Errorf("admin: deactivate: %w", err)
		}
		if err := s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.UserDeactivate, TargetType: "account", TargetID: id.String(),
			Old: map[string]string{"status": string(t.Status)}, New: map[string]string{"status": "deactivated"},
		}); err != nil {
			return err
		}
		out, err = get(ctx, tx, id)
		return err
	})
	if err != nil {
		return User{}, err
	}
	return out, s.endSessions(ctx, id)
}

// Reactivate lets a deactivated user sign in again.
func (s *UserService) Reactivate(ctx context.Context, id uuid.UUID) (User, error) {
	var out User
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		t, _, err := lock(ctx, q, id)
		if err != nil {
			return err
		}
		if t.Status != sqlc.AccountStatusDeactivated {
			return ErrState
		}
		if err := q.AdminSetStatus(ctx, sqlc.AdminSetStatusParams{Status: sqlc.AccountStatusActive, ID: id}); err != nil {
			return fmt.Errorf("admin: reactivate: %w", err)
		}
		if err := s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.UserReactivate, TargetType: "account", TargetID: id.String(),
			Old: map[string]string{"status": string(t.Status)}, New: map[string]string{"status": "active"},
		}); err != nil {
			return err
		}
		out, err = get(ctx, tx, id)
		return err
	})
	if err != nil {
		return User{}, err
	}
	// The cached record still says deactivated; sessions were already ended
	// when the user was deactivated, so only the cache needs dropping.
	if err := s.sessions.Forget(ctx, id.String()); err != nil {
		return User{}, fmt.Errorf("admin: drop session cache: %w", err)
	}
	return out, nil
}

// Delete anonymises the account (UC-04 1b, BR-13): e-mail, password hash and
// Google id are removed and status becomes deleted; the pseudonym,
// organisation and projects stay. The audit row holds no e-mail.
func (s *UserService) Delete(ctx context.Context, actor, id uuid.UUID) error {
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		if actor == id {
			return ErrSelf
		}
		q := sqlc.New(tx)
		t, admins, err := lock(ctx, q, id)
		if err != nil {
			return err
		}
		if t.Status == sqlc.AccountStatusDeleted {
			return ErrState
		}
		if isActiveAdmin(t) && admins <= 1 {
			return ErrLastAdmin
		}
		if err := q.AdminAnonymiseAccount(ctx, id); err != nil {
			return fmt.Errorf("admin: anonymise: %w", err)
		}
		return s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.UserDelete, TargetType: "account", TargetID: id.String(),
			Old: map[string]string{"status": string(t.Status), "role": string(t.Role)},
			New: map[string]string{"status": "deleted"},
		})
	})
	if err != nil {
		return err
	}
	return s.endSessions(ctx, id)
}

// endSessions bumps the session version after the change committed, which
// also drops the cached record on every replica. The status check in the
// session middleware already rejects non-active accounts once the cache
// entry expires.
func (s *UserService) endSessions(ctx context.Context, id uuid.UUID) error {
	if _, err := s.sessions.BumpVersion(ctx, id.String()); err != nil {
		return fmt.Errorf("admin: end sessions: %w", err)
	}
	return nil
}
