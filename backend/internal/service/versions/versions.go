// Package versions creates, lists, reads and deletes assessment versions.
// A new version freezes the project value and dates, the RL and impact
// thresholds and the rounding it will be scored with (BR-10); only the
// highest version number ever created is editable (BR-11).
package versions

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// ErrNotFound means no such project or version for this owner. Another
// account's data, admins included, looks absent.
var ErrNotFound = errors.New("versions: not found")

// ErrLastVersion means the version is the only live one of its project. A
// project always keeps at least one version; delete the project instead.
var ErrLastVersion = errors.New("versions: last version")

// Status is a version's lifecycle state.
type Status string

// Version statuses.
const (
	StatusDraft     Status = "draft"
	StatusSubmitted Status = "submitted"
)

// Version is a version with its snapshot values and, once submitted, the
// figures recorded at its last submission (nil for a draft).
type Version struct {
	ID           uuid.UUID
	ProjectID    uuid.UUID
	No           int
	Status       Status
	SubmissionNo int
	Editable     bool
	ValueBaht    float64
	StartDate    time.Time
	EndDate      time.Time
	CreatedAt    time.Time
	SubmittedAt  *time.Time

	ProgressAtSubmit *int
	HighCount        *int
	VeryHighCount    *int
	AverageRM        *float64
	ScoredCount      *int
	// LevelCounts holds VL, L, M, H and VH for a submitted version.
	LevelCounts map[string]int
}

// Rounding is the scoring precision copied into each new version.
type Rounding struct {
	ScoreDecimals int16
	RMDecimals    int16
}

// Service holds the versions use cases.
type Service struct {
	db       dal.DBTX
	tx       dal.Beginner
	rounding Rounding
}

// New returns a Service. db reads, tx runs the create transaction (a pool
// satisfies both) and rounding is the configured SCORE_DECIMALS/RM_DECIMALS.
func New(db dal.DBTX, tx dal.Beginner, rounding Rounding) *Service {
	return &Service{db: db, tx: tx, rounding: rounding}
}

// Create starts the next blank version of an owned project. One transaction
// locks the project row, so concurrent creates queue and each gets its own
// number; numbers count deleted versions, so none is reused.
func (s *Service) Create(ctx context.Context, projectID, owner uuid.UUID) (Version, error) {
	id := uuid.New()
	err := dal.WithTx(ctx, s.tx, func(tx pgx.Tx) error {
		return CreateInTx(ctx, tx, projectID, owner, id, s.rounding)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Version{}, ErrNotFound
	}
	if err != nil {
		return Version{}, fmt.Errorf("versions: create: %w", err)
	}
	return s.Get(ctx, projectID, id, owner)
}

// CreateInTx stores the next blank version of an owned project inside the
// caller's transaction: it locks the project row, inserts the version with
// the project value, dates and rounding, and snapshots the RL and impact
// thresholds (BR-10). It returns pgx.ErrNoRows when the project is missing,
// deleted or not owned. Service.Create and the project service's create both
// go through it, so the first version is exactly what Create would store.
func CreateInTx(ctx context.Context, tx dal.DBTX, projectID, owner, id uuid.UUID, rounding Rounding) error {
	q := sqlc.New(tx)
	if _, err := q.LockOwnedProject(ctx, sqlc.LockOwnedProjectParams{ID: projectID, OwnerID: owner}); err != nil {
		return err
	}
	if _, err := q.InsertVersion(ctx, sqlc.InsertVersionParams{
		ID: id, ProjectID: projectID,
		ScoreDecimals: rounding.ScoreDecimals, RmDecimals: rounding.RMDecimals,
	}); err != nil {
		return err
	}
	if _, err := q.SnapshotRLThresholds(ctx, id); err != nil {
		return err
	}
	_, err := q.SnapshotImpactThresholds(ctx, id)
	return err
}

// List returns the non-deleted versions of an owned project, newest first.
// A missing, deleted or foreign project is ErrNotFound; an owned project
// without versions is an empty list.
func (s *Service) List(ctx context.Context, projectID, owner uuid.UUID) ([]Version, error) {
	owned, err := sqlc.New(s.db).OwnedProjectExists(ctx, sqlc.OwnedProjectExistsParams{ID: projectID, OwnerID: owner})
	if err != nil {
		return nil, fmt.Errorf("versions: list: %w", err)
	}
	if !owned {
		return nil, ErrNotFound
	}
	rows, err := sqlc.New(s.db).ListVersions(ctx, sqlc.ListVersionsParams{ProjectID: projectID, OwnerID: owner})
	if err != nil {
		return nil, fmt.Errorf("versions: list: %w", err)
	}
	out := make([]Version, len(rows))
	for i, r := range rows {
		out[i] = fromRow(r)
	}
	return out, nil
}

// Get returns one non-deleted version of an owned project.
func (s *Service) Get(ctx context.Context, projectID, id, owner uuid.UUID) (Version, error) {
	rows, err := sqlc.New(s.db).ListVersions(ctx, sqlc.ListVersionsParams{
		ProjectID: projectID, OwnerID: owner, VersionID: uuid.NullUUID{UUID: id, Valid: true},
	})
	if err != nil {
		return Version{}, fmt.Errorf("versions: get: %w", err)
	}
	if len(rows) == 0 {
		return Version{}, ErrNotFound
	}
	return fromRow(rows[0]), nil
}

// IsEditable reports whether the version has the highest number ever created
// for its project. It stays false when a newer version was later deleted.
func (s *Service) IsEditable(ctx context.Context, projectID, id, owner uuid.UUID) (bool, error) {
	v, err := s.Get(ctx, projectID, id, owner)
	if err != nil {
		return false, err
	}
	return v.Editable, nil
}

// Delete soft-deletes a version of an owned project. Its number stays taken.
// A project keeps at least one live version: deleting the last one is
// ErrLastVersion. The project row is locked first, so two deletes of the last
// two versions queue and the second one sees the first one's result.
func (s *Service) Delete(ctx context.Context, projectID, id, owner uuid.UUID) error {
	err := dal.WithTx(ctx, s.tx, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		if _, err := q.LockOwnedProject(ctx, sqlc.LockOwnedProjectParams{ID: projectID, OwnerID: owner}); err != nil {
			return err
		}
		n, err := q.SoftDeleteVersion(ctx, sqlc.SoftDeleteVersionParams{ID: id, ProjectID: projectID, OwnerID: owner})
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrNotFound
		}
		left, err := q.CountLiveVersions(ctx, projectID)
		if err != nil {
			return err
		}
		if left == 0 {
			return ErrLastVersion // rolls the delete back
		}
		return nil
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows), errors.Is(err, ErrNotFound):
		return ErrNotFound
	case errors.Is(err, ErrLastVersion):
		return ErrLastVersion
	case err != nil:
		return fmt.Errorf("versions: delete: %w", err)
	}
	return nil
}

func fromRow(r sqlc.ListVersionsRow) Version {
	v := Version{
		ID: r.ID, ProjectID: r.ProjectID, No: int(r.VersionNo), Status: Status(r.Status),
		SubmissionNo: int(r.SubmissionNo), Editable: r.Editable, ValueBaht: r.ValueBaht,
		StartDate: r.SnapStartDate.Time, EndDate: r.SnapEndDate.Time,
		CreatedAt: r.CreatedAt, SubmittedAt: r.SubmittedAt,
	}
	if v.Status == StatusSubmitted {
		high, veryHigh, avg := int(r.HighCount), int(r.VeryHighCount), r.AverageRm
		v.HighCount, v.VeryHighCount, v.AverageRM = &high, &veryHigh, &avg
		scored := int(r.ScoredCount)
		v.ScoredCount = &scored
		v.LevelCounts = map[string]int{
			"VL": int(r.VlCount), "L": int(r.LCount), "M": int(r.MCount), "H": high, "VH": veryHigh,
		}
		if r.ProgressAtSubmit.Valid {
			p := int(r.ProgressAtSubmit.Int16)
			v.ProgressAtSubmit = &p
		}
	}
	return v
}
