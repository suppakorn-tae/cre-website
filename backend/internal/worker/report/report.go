// Package report is the worker's report job: it reads the stored results of a
// version, renders the HTML template through Gotenberg and uploads the PDF.
// It never calls the risk engine; every number comes from risk_result.
package report

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
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

// Uploader stores an object (adapter/s3.Store).
type Uploader interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
}

// Option customises the runner.
type Option func(*runner)

// WithTimeout sets the whole-job time-out.
func WithTimeout(d time.Duration) Option { return func(r *runner) { r.timeout = d } }

// WithClock replaces the clock that stamps the report date.
func WithClock(now func() time.Time) Option { return func(r *runner) { r.now = now } }

type runner struct {
	src     Source
	render  Renderer
	up      Uploader
	timeout time.Duration
	now     func() time.Time
}

// NewRunner returns the runner for jobs of kind report. It is idempotent: the
// object key is derived from the job id, so a job claimed twice overwrites the
// same object. The runtime marks the job done or failed from the result.
func NewRunner(src Source, render Renderer, up Uploader, opts ...Option) runtime.Runner {
	r := &runner{src: src, render: render, up: up, timeout: DefaultTimeout, now: time.Now}
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
	out, err := r.render.Render(ctx, html, assets, pdf.Options{})
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
	return nil
}
