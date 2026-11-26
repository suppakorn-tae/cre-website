// Package reports requests PDF reports and serves finished ones. The worker
// renders the file; this package only creates the job and streams the result.
package reports

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
)

var (
	// ErrNotFound means the project, version or report is not the caller's,
	// or is deleted.
	ErrNotFound = errors.New("reports: not found")
	// ErrNotSubmitted means the version is still a draft.
	ErrNotSubmitted = errors.New("reports: version is not submitted")
	// ErrNotReady means the report job is not done yet (or failed).
	ErrNotReady = errors.New("reports: report is not ready")
	// ErrFileMissing means the job is done but the file is gone from storage.
	ErrFileMissing = errors.New("reports: report file is missing")
)

// Jobs is what the service needs from the Jobs Service.
type Jobs interface {
	Insert(ctx context.Context, db dal.DBTX, kind jobs.Kind, requester uuid.UUID) (jobs.Job, error)
	Enqueue(ctx context.Context, j jobs.Job) error
}

// Store reads report files.
type Store interface {
	Get(ctx context.Context, key string) (io.ReadCloser, error)
}

// Service requests and serves reports.
type Service struct {
	db    dal.DBTX
	begin dal.Beginner
	jobs  Jobs
	store Store
	log   *slog.Logger
}

// New returns a Service. begin must be backed by the same database as db.
func New(db dal.DBTX, begin dal.Beginner, j Jobs, store Store, log *slog.Logger) *Service {
	if log == nil {
		log = slog.Default()
	}
	return &Service{db: db, begin: begin, jobs: j, store: store, log: log}
}

// Request returns the version's current report job, or creates one when there
// is none or what the PDF shows changed since the latest one was asked for
// (one current PDF per version, architecture decisions v2.14). The previous
// done job keeps its file until the new one is done; the worker then deletes
// it. The version must belong to the requester's project and not be deleted
// (ErrNotFound) and be submitted (ErrNotSubmitted).
func (s *Service) Request(ctx context.Context, requester, projectID, versionID uuid.UUID) (uuid.UUID, error) {
	var job jobs.Job
	var created bool
	err := dal.WithTx(ctx, s.begin, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		v, err := q.GetVersionForReport(ctx, sqlc.GetVersionForReportParams{
			VersionID: versionID, ProjectID: projectID, OwnerID: requester,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("reports: get version: %w", err)
		}
		if v.Status != sqlc.VersionStatusSubmitted {
			return ErrNotSubmitted
		}
		if err := q.LockReportRequest(ctx, versionID.String()); err != nil {
			return fmt.Errorf("reports: lock: %w", err)
		}
		cur, err := q.FindLatestReportJob(ctx, sqlc.FindLatestReportJobParams{
			VersionID: versionID, RequestedBy: requester,
		})
		switch {
		case err == nil:
			if isCurrent(cur, v.SubmissionNo) {
				job = jobs.Job{ID: cur.ID}
				return nil
			}
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("reports: find job: %w", err)
		}
		job, err = s.jobs.Insert(ctx, tx, jobs.KindReport, requester)
		if err != nil {
			return err
		}
		if err := q.InsertReportJob(ctx, sqlc.InsertReportJobParams{
			JobID: job.ID, VersionID: versionID, SubmissionNo: v.SubmissionNo,
		}); err != nil {
			return fmt.Errorf("reports: insert report job: %w", err)
		}
		created = true
		return nil
	})
	if err != nil {
		return uuid.Nil, err
	}
	if created {
		// The row is committed; when the enqueue fails it stays queued and
		// the worker re-enqueues it on start, so the request still succeeds.
		if err := s.jobs.Enqueue(ctx, job); err != nil {
			s.log.WarnContext(ctx, "report enqueue failed; job stays queued", "job_id", job.ID, "error", err)
		}
	}
	return job.ID, nil
}

// isCurrent reports whether the latest live job still shows what the version
// shows now: it was asked for the version's last submission, and neither the
// project nor a chosen strategy changed at or after the job was created. The
// worker reads the data after the job is created, so a change before that is
// in the PDF; an equal time counts as a change. Everything comes from stored
// timestamps; nothing is recalculated.
func isCurrent(j sqlc.FindLatestReportJobRow, submissionNo int32) bool {
	return j.SubmissionNo == submissionNo && j.InputsChangedAt.Before(j.CreatedAt)
}

// File is a report ready to stream. The caller must close Body.
type File struct {
	Body io.ReadCloser
	// Disposition is the Content-Disposition header value.
	Disposition string
}

// Download opens the finished report of a job the requester owns. It returns
// ErrNotFound for another account's job (admins included), a job that is not
// a report, or a deleted version; ErrNotReady when the job is not done;
// ErrFileMissing when storage has no file.
func (s *Service) Download(ctx context.Context, requester, jobID uuid.UUID) (File, error) {
	row, err := sqlc.New(s.db).GetReportForDownload(ctx, sqlc.GetReportForDownloadParams{
		JobID: jobID, RequestedBy: requester,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return File{}, ErrNotFound
	}
	if err != nil {
		return File{}, fmt.Errorf("reports: get report: %w", err)
	}
	if row.Status != sqlc.JobStatusDone {
		return File{}, ErrNotReady
	}
	body, err := s.store.Get(ctx, jobs.ObjectKey(jobs.KindReport, jobID))
	if errors.Is(err, s3.ErrNotFound) {
		return File{}, ErrFileMissing
	}
	if err != nil {
		return File{}, fmt.Errorf("reports: open file: %w", err)
	}
	name := fmt.Sprintf("report-%s-v%d.pdf", row.Nickname, row.VersionNo)
	return File{Body: body, Disposition: mime.FormatMediaType("attachment", map[string]string{"filename": name})}, nil
}
