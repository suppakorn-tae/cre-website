package report_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/report"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
	tmpl "github.com/suppakorn-tae/cre-website/backend/templates/report"
)

type fakeSource struct {
	data tmpl.Data
	err  error
}

func (f fakeSource) Load(context.Context, uuid.UUID) (tmpl.Data, error) { return f.data, f.err }

type fakeRenderer struct {
	out   []byte
	err   error
	calls int
	html  string
	files map[string][]byte
}

func (f *fakeRenderer) Render(_ context.Context, html []byte, assets map[string][]byte, _ pdf.Options) ([]byte, error) {
	f.calls++
	f.html, f.files = string(html), assets
	return f.out, f.err
}

type fakeUploader struct {
	objects map[string][]byte
	err     error
	delErr  map[string]error
	log     *[]string // shared event log, when set
}

func (f *fakeUploader) Delete(_ context.Context, key string) error {
	if err := f.delErr[key]; err != nil {
		return err
	}
	if f.log != nil {
		*f.log = append(*f.log, "delete "+key)
	}
	delete(f.objects, key)
	return nil
}

func (f *fakeUploader) Put(_ context.Context, key string, r io.Reader, size int64, ct string) error {
	if f.err != nil {
		return f.err
	}
	b, _ := io.ReadAll(r)
	if int64(len(b)) != size || ct != "application/pdf" {
		return errors.New("bad size or content type")
	}
	if f.objects == nil {
		f.objects = map[string][]byte{}
	}
	f.objects[key] = b
	return nil
}

func data() tmpl.Data {
	return tmpl.Data{
		ProjectName: "p", Island: "koh_tao", Type: "road", VersionNo: 1, RMDecimals: 2, ScoreDecimals: 2,
		Indicators: []tmpl.Indicator{{Code: "EC-1", Name: "n", Level: "M", RL: 3, RIC: 3, RIT: 3, RIE: 3, RIMax: 3, RM: 3}},
	}
}

func job() jobs.Job { return jobs.Job{ID: uuid.New(), Kind: jobs.KindReport} }

func TestRunnerUploadsToDeterministicKey(t *testing.T) {
	r := &fakeRenderer{out: []byte("%PDF-1.7 x")}
	up := &fakeUploader{}
	j := job()
	run := report.NewRunner(fakeSource{data: data()}, r, up)

	for i := 0; i < 2; i++ { // a re-claimed job runs again and overwrites
		if err := run(context.Background(), j); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	if len(up.objects) != 1 {
		t.Fatalf("objects = %d, want 1", len(up.objects))
	}
	if _, ok := up.objects["reports/"+j.ID.String()+".pdf"]; !ok {
		t.Errorf("keys = %v", up.objects)
	}
	for _, f := range []string{"style.css", "Sarabun-Regular.ttf", "Sarabun-Bold.ttf"} {
		if _, ok := r.files[f]; !ok {
			t.Errorf("asset %s not sent to the renderer", f)
		}
	}
}

func TestRunnerFailures(t *testing.T) {
	boom := errors.New("boom")
	empty := data()
	empty.Indicators = nil
	tests := []struct {
		name string
		src  fakeSource
		r    *fakeRenderer
		up   *fakeUploader
		j    jobs.Job
		want string
	}{
		{"load", fakeSource{err: boom}, &fakeRenderer{}, &fakeUploader{}, job(), "load data"},
		{"no results", fakeSource{data: empty}, &fakeRenderer{}, &fakeUploader{}, job(), "no stored results"},
		{"render", fakeSource{data: data()}, &fakeRenderer{err: boom}, &fakeUploader{}, job(), "render pdf"},
		{"not a pdf", fakeSource{data: data()}, &fakeRenderer{out: []byte("<html>")}, &fakeUploader{}, job(), "did not return a pdf"},
		{"upload", fakeSource{data: data()}, &fakeRenderer{out: []byte("%PDF-1")}, &fakeUploader{err: boom}, job(), "upload"},
		{"wrong kind", fakeSource{data: data()}, &fakeRenderer{}, &fakeUploader{}, jobs.Job{ID: uuid.New(), Kind: jobs.KindExport}, "kind"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := report.NewRunner(tt.src, tt.r, tt.up)(context.Background(), tt.j)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want it to contain %q", err, tt.want)
			}
			if len(tt.up.objects) != 0 {
				t.Error("an object was uploaded after a failure")
			}
		})
	}
}

func TestRunnerStampsReportDate(t *testing.T) {
	r := &fakeRenderer{out: []byte("%PDF-1")}
	now := time.Date(2026, 11, 25, 3, 0, 0, 0, time.UTC)
	run := report.NewRunner(fakeSource{data: data()}, r, &fakeUploader{}, report.WithClock(func() time.Time { return now }))
	if err := run(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(r.html, "25 พฤศจิกายน พ.ศ. 2569") {
		t.Error("report date is not stamped in Buddhist era")
	}
}

// replacingSource is a Source that also implements report.Replacements.
type replacingSource struct {
	fakeSource
	olds    []report.Replaced
	listErr error
	markErr error
	log     *[]string
}

func (s *replacingSource) Replaced(context.Context, uuid.UUID) ([]report.Replaced, error) {
	*s.log = append(*s.log, "list")
	return s.olds, s.listErr
}

func (s *replacingSource) MarkReplaced(_ context.Context, id uuid.UUID) (bool, error) {
	if s.markErr != nil {
		return false, s.markErr
	}
	*s.log = append(*s.log, "mark "+id.String())
	return true, nil
}

func old() report.Replaced {
	id := uuid.New()
	return report.Replaced{JobID: id, VersionID: uuid.New(), ObjectKey: "reports/" + id.String() + ".pdf"}
}

func TestReplacementWaitsForDoneThenDeletesBeforeMarking(t *testing.T) {
	var log []string
	a, b := old(), old()
	src := &replacingSource{fakeSource: fakeSource{data: data()}, olds: []report.Replaced{a, b}, log: &log}
	up := &fakeUploader{log: &log, objects: map[string][]byte{a.ObjectKey: nil, b.ObjectKey: nil}}
	run := report.NewRunner(src, &fakeRenderer{out: []byte("%PDF-1")}, up)

	ctx, fireDone := runtime.WithDoneHooks(context.Background())
	if err := run(ctx, job()); err != nil {
		t.Fatal(err)
	}
	if len(log) != 0 {
		t.Fatalf("replacement ran before the job was done: %v", log)
	}
	fireDone(context.Background())
	want := []string{"list", "delete " + a.ObjectKey, "mark " + a.JobID.String(), "delete " + b.ObjectKey, "mark " + b.JobID.String()}
	if strings.Join(log, "|") != strings.Join(want, "|") {
		t.Fatalf("log = %v, want %v", log, want)
	}
	if _, ok := up.objects[a.ObjectKey]; ok {
		t.Error("replaced object still stored")
	}
}

func TestFailedRenderKeepsReplacedReports(t *testing.T) {
	var log []string
	src := &replacingSource{fakeSource: fakeSource{data: data()}, olds: []report.Replaced{old()}, log: &log}
	run := report.NewRunner(src, &fakeRenderer{err: errors.New("boom")}, &fakeUploader{log: &log})
	ctx, fireDone := runtime.WithDoneHooks(context.Background())
	if err := run(ctx, job()); err == nil {
		t.Fatal("want a render error")
	}
	fireDone(context.Background()) // the runtime would not, but even so nothing is queued
	if len(log) != 0 {
		t.Fatalf("a failed render touched old reports: %v", log)
	}
}

func TestReplacementFailuresKeepRowsForRetry(t *testing.T) {
	boom := errors.New("boom")
	t.Run("delete fails: not marked, next one still handled", func(t *testing.T) {
		var log []string
		a, b := old(), old()
		src := &replacingSource{fakeSource: fakeSource{data: data()}, olds: []report.Replaced{a, b}, log: &log}
		up := &fakeUploader{log: &log, delErr: map[string]error{a.ObjectKey: boom}}
		ctx, fireDone := runtime.WithDoneHooks(context.Background())
		if err := report.NewRunner(src, &fakeRenderer{out: []byte("%PDF-1")}, up)(ctx, job()); err != nil {
			t.Fatal(err)
		}
		fireDone(context.Background())
		want := []string{"list", "delete " + b.ObjectKey, "mark " + b.JobID.String()}
		if strings.Join(log, "|") != strings.Join(want, "|") {
			t.Fatalf("log = %v, want %v", log, want)
		}
	})
	t.Run("list fails: nothing deleted", func(t *testing.T) {
		var log []string
		src := &replacingSource{fakeSource: fakeSource{data: data()}, olds: []report.Replaced{old()}, listErr: boom, log: &log}
		ctx, fireDone := runtime.WithDoneHooks(context.Background())
		if err := report.NewRunner(src, &fakeRenderer{out: []byte("%PDF-1")}, &fakeUploader{log: &log})(ctx, job()); err != nil {
			t.Fatal(err)
		}
		fireDone(context.Background())
		if strings.Join(log, "|") != "list" {
			t.Fatalf("log = %v", log)
		}
	})
}

func TestNoReplacementOutsideRuntime(t *testing.T) {
	var log []string
	src := &replacingSource{fakeSource: fakeSource{data: data()}, olds: []report.Replaced{old()}, log: &log}
	if err := report.NewRunner(src, &fakeRenderer{out: []byte("%PDF-1")}, &fakeUploader{log: &log})(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	if len(log) != 0 {
		t.Fatalf("old reports touched without a done hook: %v", log)
	}
}
