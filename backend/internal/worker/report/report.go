// Package report is the worker's report job: it reads the stored results of a
// version, renders the HTML template through Gotenberg and uploads the PDF.
// It never calls the risk engine; every number comes from risk_result.
//
// A version has one current PDF (architecture decisions v2.14). Once a new
// report is marked done, the reports it replaces lose their file and are
// marked expired; their rows stay for history.
package report

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
	"github.com/suppakorn-tae/cre-website/backend/templates/fonts"
	tmpl "github.com/suppakorn-tae/cre-website/backend/templates/report"
)

// DefaultTimeout bounds one whole report job (load, render, upload).
const DefaultTimeout = 5 * time.Minute

// contentType of the uploaded object.
const contentType = "application/pdf"

// Source loads the report data of a report job from stored results.
type Source interface {
	Load(ctx context.Context, jobID uuid.UUID) (tmpl.Data, error)
}

// Renderer turns HTML plus assets into a PDF (adapter/pdf.Client).
type Renderer interface {
	Render(ctx context.Context, html []byte, assets map[string][]byte, opts pdf.Options) ([]byte, error)
}

// Uploader stores and deletes objects (adapter/s3.Store). Delete of a missing
// key must not fail.
type Uploader interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	Delete(ctx context.Context, key string) error
}

// Replaced is a done report that a newer done report of its version replaces.
type Replaced struct {
	JobID     uuid.UUID
	VersionID uuid.UUID
	ObjectKey string
}

// Replacements finds and retires replaced reports (Store). A Source that
// also implements it turns on the replacement; without it the runner only
// renders.
type Replacements interface {
	// Replaced lists the replaced reports of the version of jobID.
	Replaced(ctx context.Context, jobID uuid.UUID) ([]Replaced, error)
	// MarkReplaced marks a replaced report expired; false means it was
	// not done any more (another worker got there first).
	MarkReplaced(ctx context.Context, jobID uuid.UUID) (bool, error)
}

// Option customises the runner.
type Option func(*runner)

// WithTimeout sets the whole-job time-out.
func WithTimeout(d time.Duration) Option { return func(r *runner) { r.timeout = d } }

// WithClock replaces the clock that stamps the report date.
func WithClock(now func() time.Time) Option { return func(r *runner) { r.now = now } }

// WithLogger sets the logger of the replacement step; the default is
// slog.Default().
func WithLogger(l *slog.Logger) Option { return func(r *runner) { r.log = l } }

type runner struct {
	src     Source
	rep     Replacements
	render  Renderer
	up      Uploader
	timeout time.Duration
	now     func() time.Time
	log     *slog.Logger
}

// NewRunner returns the runner for jobs of kind report. It is idempotent: the
// object key is derived from the job id, so a job claimed twice overwrites the
// same object. The runtime marks the job done or failed from the result; when
// src implements Replacements, the reports this one replaces are retired after
// the runtime marked it done (runtime.OnDone), never before, so a failed
// render keeps the previous file.
func NewRunner(src Source, render Renderer, up Uploader, opts ...Option) runtime.Runner {
	r := &runner{src: src, render: render, up: up, timeout: DefaultTimeout, now: time.Now, log: slog.Default()}
	r.rep, _ = src.(Replacements)
	for _, o := range opts {
		o(r)
	}
	return r.run
}

func (r *runner) run(ctx context.Context, j jobs.Job) error {
	if j.Kind != jobs.KindReport {
		return fmt.Errorf("report: job %s has kind %q", j.ID, j.Kind)
	}
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	data, err := r.src.Load(ctx, j.ID)
	if err != nil {
		return fmt.Errorf("report: load data: %w", err)
	}
	data.GeneratedAt = r.now()
	if len(data.Indicators) == 0 {
		return errors.New("report: version has no stored results")
	}
	html, assets, err := tmpl.Render(data)
	if err != nil {
		return fmt.Errorf("report: build html: %w", err)
	}
	for name, b := range fonts.Files() {
		assets[name] = b
	}
	out, err := r.render.Render(ctx, html, assets, pdf.Options{PreferCSSPageSize: true})
	if err != nil {
		return fmt.Errorf("report: render pdf: %w", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF-")) {
		return errors.New("report: gotenberg did not return a pdf")
	}
	key := jobs.ObjectKey(jobs.KindReport, j.ID)
	if err := r.up.Put(ctx, key, bytes.NewReader(out), int64(len(out)), contentType); err != nil {
		return fmt.Errorf("report: upload %s: %w", key, err)
	}
	if r.rep != nil && !runtime.OnDone(ctx, func(ctx context.Context) { r.replace(ctx, j.ID) }) {
		r.log.WarnContext(ctx, "report runs outside the worker runtime; replaced reports are kept", "job_id", j.ID)
	}
	return nil
}

// replace deletes the files of the reports that the done job jobID replaces
// and marks them expired. The file goes first: when marking fails, the row
// is still listed and the next replacement of the version retries it (the
// repeated delete is harmless). A failure is logged, never returned: the new
// report is done whatever happens to the old file.
func (r *runner) replace(ctx context.Context, jobID uuid.UUID) {
	olds, err := r.rep.Replaced(ctx, jobID)
	if err != nil {
		r.log.ErrorContext(ctx, "list replaced reports failed", "job_id", jobID, "error", err.Error())
		return
	}
	for _, o := range olds {
		if err := r.up.Delete(ctx, o.ObjectKey); err != nil {
			r.log.ErrorContext(ctx, "delete replaced report failed", "job_id", o.JobID,
				"version_id", o.VersionID, "object_key", o.ObjectKey, "replaced_by", jobID, "error", err.Error())
			continue
		}
		ok, err := r.rep.MarkReplaced(ctx, o.JobID)
		if err != nil {
			r.log.ErrorContext(ctx, "mark replaced report failed", "job_id", o.JobID,
				"version_id", o.VersionID, "object_key", o.ObjectKey, "replaced_by", jobID, "error", err.Error())
			continue
		}
		if ok {
			r.log.InfoContext(ctx, "replaced report deleted", "job_id", o.JobID,
				"version_id", o.VersionID, "object_key", o.ObjectKey, "replaced_by", jobID)
		}
	}
}
