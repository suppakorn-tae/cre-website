// Package export requests research exports and serves finished ones. The
// worker builds the ZIP; this package creates the job and streams the file.
// Both the request and every download are audited.
package export

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

var (
	// ErrNotFound means no export job has this id.
	ErrNotFound = errors.New("export: not found")
	// ErrNotReady means the export is queued, running or failed.
	ErrNotReady = errors.New("export: export is not ready")
	// ErrExpired means the export file is past its 7 days (HTTP 410).
	ErrExpired = errors.New("export: export has expired")
	// ErrFileMissing means the job is done but storage has no file.
	ErrFileMissing = errors.New("export: export file is missing")
)

// Scope is which users an export covers.
type Scope string

// Export scopes.
const (
	ScopeAll      Scope = "all"
	ScopeSelected Scope = "selected"
)

// Field error codes.
const (
	CodeRequired     = "required"
	CodeNotAllowed   = "not_allowed"
	CodeInvalidValue = "invalid_value"
	CodeNotFound     = "not_found"
	CodeDuplicate    = "duplicate"
)

// Jobs is what the service needs from the Jobs Service.
type Jobs interface {
	Insert(ctx context.Context, db dal.DBTX, kind jobs.Kind, requester uuid.UUID) (jobs.Job, error)
	Enqueue(ctx context.Context, j jobs.Job) error
}

// Recorder writes an audit entry on the caller's transaction.
type Recorder = admin.Recorder

// Store reads export files.
type Store interface {
	Get(ctx context.Context, key string) (io.ReadCloser, error)
}

// Params is an export request.
type Params struct {
	Scope          Scope
	UserIDs        []uuid.UUID
	IncludeDeleted bool
}

// requestAudit is the audited form of a request.
type requestAudit struct {
	Scope          Scope       `json:"scope"`
	UserIDs        []uuid.UUID `json:"user_ids,omitempty"`
	IncludeDeleted bool        `json:"include_deleted"`
}

// Service requests and serves exports.
type Service struct {
	db    dal.DBTX
	begin dal.Beginner
	jobs  Jobs
	audit Recorder
	store Store
	log   *slog.Logger
	now   func() time.Time
}

// New returns a Service. begin must be backed by the same database as db.
func New(db dal.DBTX, begin dal.Beginner, j Jobs, rec Recorder, store Store, log *slog.Logger) *Service {
	if log == nil {
		log = slog.Default()
	}
	return &Service{db: db, begin: begin, jobs: j, audit: rec, store: store, log: log, now: time.Now}
}

func (s *Service) validate(ctx context.Context, p Params) error {
	switch p.Scope {
	case ScopeAll:
		if len(p.UserIDs) > 0 {
			return admin.ValidationError{{Field: "/user_ids", Code: CodeNotAllowed}}
		}
		return nil
	case ScopeSelected:
		if len(p.UserIDs) == 0 {
			return admin.ValidationError{{Field: "/user_ids", Code: CodeRequired}}
		}
	default:
		return admin.ValidationError{{Field: "/scope", Code: CodeInvalidValue}}
	}
	var errs admin.ValidationError
	seen := make(map[uuid.UUID]bool, len(p.UserIDs))
	for i, id := range p.UserIDs {
		if seen[id] {
			errs = append(errs, admin.FieldError{Field: fmt.Sprintf("/user_ids/%d", i), Code: CodeDuplicate})
		}
		seen[id] = true
	}
	if len(errs) > 0 {
		return errs
	}
	found, err := sqlc.New(s.db).ListExistingAccountIDs(ctx, p.UserIDs)
	if err != nil {
		return fmt.Errorf("export: check accounts: %w", err)
	}
	exists := make(map[uuid.UUID]bool, len(found))
	for _, id := range found {
		exists[id] = true
	}
	for i, id := range p.UserIDs {
		if !exists[id] {
			errs = append(errs, admin.FieldError{Field: fmt.Sprintf("/user_ids/%d", i), Code: CodeNotFound})
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

// Request creates an export job, its scope rows and the audit entry in one
// transaction, then enqueues it. A validation problem is an
// admin.ValidationError.
func (s *Service) Request(ctx context.Context, adminID uuid.UUID, p Params) (uuid.UUID, error) {
	if err := s.validate(ctx, p); err != nil {
		return uuid.Nil, err
	}
	var job jobs.Job
	err := dal.WithTx(ctx, s.begin, func(tx pgx.Tx) error {
		var err error
		job, err = s.jobs.Insert(ctx, tx, jobs.KindExport, adminID)
		if err != nil {
			return err
		}
		q := sqlc.New(tx)
		if err := q.InsertExportJob(ctx, sqlc.InsertExportJobParams{
			JobID: job.ID, Scope: sqlc.ExportScope(p.Scope), IncludeDeleted: p.IncludeDeleted,
		}); err != nil {
			return fmt.Errorf("export: insert export job: %w", err)
		}
		if p.Scope == ScopeSelected {
			if err := q.InsertExportJobAccounts(ctx, sqlc.InsertExportJobAccountsParams{
				JobID: job.ID, AccountIds: p.UserIDs,
			}); err != nil {
				return fmt.Errorf("export: insert export accounts: %w", err)
			}
		}
		return s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.ExportRequest, TargetType: "export", TargetID: job.ID.String(),
			New: requestAudit{Scope: p.Scope, UserIDs: p.UserIDs, IncludeDeleted: p.IncludeDeleted},
		})
	})
	if err != nil {
		return uuid.Nil, err
	}
	// The row is committed; when the enqueue fails it stays queued and the
	// worker re-enqueues it on start, so the request still succeeds.
	if err := s.jobs.Enqueue(ctx, job); err != nil {
		s.log.WarnContext(ctx, "export enqueue failed; job stays queued", "job_id", job.ID, "error", err)
	}
	return job.ID, nil
}

// File is an export ready to stream. The caller must close Body.
type File struct {
	Body io.ReadCloser
	// Disposition is the Content-Disposition header value.
	Disposition string
}

// Download audits the download, then opens the file. It returns ErrNotFound
// for an unknown or non-export job, ErrNotReady while the job is not done,
// ErrExpired after expires_at (or once the sweep marked it expired) and
// ErrFileMissing when storage has no file. Only a download that can start
// is audited, and its row commits before the caller streams a byte.
func (s *Service) Download(ctx context.Context, jobID uuid.UUID) (File, error) {
	row, err := sqlc.New(s.db).GetExportJob(ctx, jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return File{}, ErrNotFound
	}
	if err != nil {
		return File{}, fmt.Errorf("export: get job: %w", err)
	}
	switch {
	case row.Status == sqlc.JobStatusExpired:
		return File{}, ErrExpired
	case row.Status != sqlc.JobStatusDone:
		return File{}, ErrNotReady
	case row.ExpiresAt != nil && !s.now().Before(*row.ExpiresAt):
		return File{}, ErrExpired
	}
	body, err := s.store.Get(ctx, jobs.ObjectKey(jobs.KindExport, jobID))
	if errors.Is(err, s3.ErrNotFound) {
		return File{}, ErrFileMissing
	}
	if err != nil {
		return File{}, fmt.Errorf("export: open file: %w", err)
	}
	err = dal.WithTx(ctx, s.begin, func(tx pgx.Tx) error {
		return s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.ExportDownload, TargetType: "export", TargetID: jobID.String(),
		})
	})
	if err != nil {
		_ = body.Close()
		return File{}, err
	}
	name := "export-" + jobID.String() + ".zip"
	return File{Body: body, Disposition: mime.FormatMediaType("attachment", map[string]string{"filename": name})}, nil
}
