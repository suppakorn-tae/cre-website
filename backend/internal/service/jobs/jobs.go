// Package jobs is the Jobs Service: one model for reports and research
// exports. The job row in Postgres is the source of truth; an asynq task runs
// it. The task is enqueued only after the row is committed.
package jobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// Kind is the job kind; it is also the asynq task type.
type Kind string

// Job kinds.
const (
	KindReport Kind = "report"
	KindExport Kind = "export"
)

// Status is the job state.
type Status string

// Job states.
const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusDone    Status = "done"
	StatusFailed  Status = "failed"
	StatusExpired Status = "expired"
)

// ExportTTL is how long a finished export stays downloadable.
const ExportTTL = 7 * 24 * time.Hour

var (
	// ErrNotFound means no such job for this requester.
	ErrNotFound = errors.New("jobs: not found")
	// ErrNotRunnable means the job is already finished (or gone), so a
	// duplicate or late task must not run it again.
	ErrNotRunnable = errors.New("jobs: job is not queued or running")
)

// Job is a job row.
type Job struct {
	ID          uuid.UUID
	Kind        Kind
	RequestedBy uuid.UUID
	Status      Status
	ObjectKey   *string
	Error       *string
	CreatedAt   time.Time
	StartedAt   *time.Time
	FinishedAt  *time.Time
	ExpiresAt   *time.Time
}

// ObjectKey is where a finished job's file is stored.
func ObjectKey(k Kind, id uuid.UUID) string {
	if k == KindExport {
		return "exports/" + id.String() + ".zip"
	}
	return "reports/" + id.String() + ".pdf"
}

// QueueFor maps a kind to its queue.
func QueueFor(k Kind) string {
	if k == KindExport {
		return queue.Exports
	}
	return queue.Reports
}

// Pool is a database pool: queries plus transactions.
type Pool interface {
	dal.DBTX
	dal.Beginner
}

// Service creates jobs and moves them through their states.
type Service struct {
	db    dal.DBTX
	begin dal.Beginner
	enq   queue.Enqueuer
	now   func() time.Time
}

// New returns a Service.
func New(db Pool, enq queue.Enqueuer) *Service {
	return &Service{db: db, begin: db, enq: enq, now: time.Now}
}

// NewReader returns a Service that can only read jobs (GetForRequester), for
// the api, which holds a DBTX but creates jobs through other services.
func NewReader(db dal.DBTX) *Service {
	return &Service{db: db, now: time.Now}
}

func fromRow(r sqlc.Job) Job {
	j := Job{
		ID: r.ID, Kind: Kind(r.Kind), RequestedBy: r.RequestedBy, Status: Status(r.Status),
		CreatedAt: r.CreatedAt, StartedAt: r.StartedAt, FinishedAt: r.FinishedAt, ExpiresAt: r.ExpiresAt,
	}
	if r.ObjectKey.Valid {
		j.ObjectKey = &r.ObjectKey.String
	}
	if r.Error.Valid {
		j.Error = &r.Error.String
	}
	return j
}

// Insert adds a queued job row on db, normally the caller's transaction so
// the row commits with the report or export rows that belong to it. After
// the commit the caller must call Enqueue.
func (s *Service) Insert(ctx context.Context, db dal.DBTX, kind Kind, requester uuid.UUID) (Job, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return Job{}, fmt.Errorf("jobs: new id: %w", err)
	}
	r, err := sqlc.New(db).InsertJob(ctx, sqlc.InsertJobParams{
		ID: id, Kind: sqlc.JobKind(kind), RequestedBy: requester,
	})
	if err != nil {
		return Job{}, fmt.Errorf("jobs: insert: %w", err)
	}
	return fromRow(r), nil
}

// Enqueue puts the committed job on its queue. When it fails the row stays
// queued and the worker re-enqueues it on its next start.
func (s *Service) Enqueue(ctx context.Context, j Job) error {
	if err := s.enq.Enqueue(ctx, string(j.Kind), []byte(j.ID.String()), QueueFor(j.Kind)); err != nil {
		return fmt.Errorf("jobs: enqueue %s: %w", j.ID, err)
	}
	return nil
}

// Create inserts a job in its own transaction, then enqueues it.
func (s *Service) Create(ctx context.Context, kind Kind, requester uuid.UUID) (Job, error) {
	if s.begin == nil || s.enq == nil {
		return Job{}, errors.New("jobs: service built with NewReader cannot create jobs")
	}
	var j Job
	err := dal.WithTx(ctx, s.begin, func(tx pgx.Tx) error {
		var err error
		j, err = s.Insert(ctx, tx, kind, requester)
		return err
	})
	if err != nil {
		return Job{}, err
	}
	return j, s.Enqueue(ctx, j)
}

// GetForRequester returns the job only when requester owns it; any other
// caller, admins included, gets ErrNotFound.
func (s *Service) GetForRequester(ctx context.Context, id, requester uuid.UUID) (Job, error) {
	r, err := sqlc.New(s.db).GetJobForRequester(ctx, sqlc.GetJobForRequesterParams{ID: id, RequestedBy: requester})
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	if err != nil {
		return Job{}, fmt.Errorf("jobs: get: %w", err)
	}
	return fromRow(r), nil
}

// MarkRunning claims a queued job, or one a crashed worker left running.
func (s *Service) MarkRunning(ctx context.Context, id uuid.UUID) (Job, error) {
	r, err := sqlc.New(s.db).MarkJobRunning(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotRunnable
	}
	if err != nil {
		return Job{}, fmt.Errorf("jobs: mark running: %w", err)
	}
	return fromRow(r), nil
}

// MarkDone finishes a running job. The object key follows the kind and an
// export gets its 7-day expiry.
func (s *Service) MarkDone(ctx context.Context, j Job) error {
	var exp *time.Time
	if j.Kind == KindExport {
		t := s.now().Add(ExportTTL)
		exp = &t
	}
	n, err := sqlc.New(s.db).MarkJobDone(ctx, sqlc.MarkJobDoneParams{
		ID: j.ID, ObjectKey: pgtype.Text{String: ObjectKey(j.Kind, j.ID), Valid: true}, ExpiresAt: exp,
	})
	return rowsOrErr(n, err, "mark done")
}

// MarkFailed ends a queued or running job with a developer-facing message.
func (s *Service) MarkFailed(ctx context.Context, id uuid.UUID, msg string) error {
	n, err := sqlc.New(s.db).MarkJobFailed(ctx, sqlc.MarkJobFailedParams{
		ID: id, Error: pgtype.Text{String: msg, Valid: true},
	})
	return rowsOrErr(n, err, "mark failed")
}

// MarkExpired flags a done export whose file was swept.
func (s *Service) MarkExpired(ctx context.Context, id uuid.UUID) error {
	n, err := sqlc.New(s.db).MarkJobExpired(ctx, id)
	return rowsOrErr(n, err, "mark expired")
}

func rowsOrErr(n int64, err error, what string) error {
	if err != nil {
		return fmt.Errorf("jobs: %s: %w", what, err)
	}
	if n == 0 {
		return fmt.Errorf("jobs: %s: %w", what, ErrNotRunnable)
	}
	return nil
}

// Requeue enqueues every job left queued or running, for the worker to call
// on start-up (Valkey may have lost its tasks). It returns how many it
// enqueued; a task that already exists is harmless because the runtime skips
// jobs that are finished.
func (s *Service) Requeue(ctx context.Context) (int, error) {
	rows, err := sqlc.New(s.db).ListUnfinishedJobs(ctx)
	if err != nil {
		return 0, fmt.Errorf("jobs: list unfinished: %w", err)
	}
	for i, r := range rows {
		if err := s.Enqueue(ctx, fromRow(r)); err != nil {
			return i, err
		}
	}
	return len(rows), nil
}
