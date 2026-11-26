package report_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/report"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
)

// startRustFS runs the object store we deploy (see adapter/s3 tests).
func startRustFS(t *testing.T) *s3.Store {
	t.Helper()
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "rustfs/rustfs:latest",
			ExposedPorts: []string{"9000/tcp"},
			Env:          map[string]string{"RUSTFS_ACCESS_KEY": "rustfsadmin", "RUSTFS_SECRET_KEY": "rustfsadmin-secret"},
			WaitingFor:   wait.ForHTTP("/health").WithPort("9000/tcp").WithStartupTimeout(2 * time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start rustfs: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(c) })
	endpoint, err := c.PortEndpoint(ctx, "9000/tcp", "http")
	if err != nil {
		t.Fatal(err)
	}
	st, err := s3.New(s3.Config{
		Endpoint: endpoint, Region: "us-east-1", Bucket: "cre",
		AccessKey: "rustfsadmin", SecretKey: "rustfsadmin-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.EnsureBucket(ctx); err != nil {
		t.Fatal(err)
	}
	return st
}

type nopEnqueuer struct{}

func (nopEnqueuer) Enqueue(context.Context, string, []byte, string) error { return nil }

// oneServer keeps the report handler so the test can run a job by id.
type oneServer struct{ h queue.Handler }

func (s *oneServer) Handle(_ string, h queue.Handler) { s.h = h }
func (s *oneServer) Start() error                     { return nil }
func (s *oneServer) Stop()                            {}

// countingRenderer returns a distinct PDF per call, or fails when fail is set.
type countingRenderer struct {
	calls int
	fail  bool
}

func (r *countingRenderer) Render(context.Context, []byte, map[string][]byte, pdf.Options) ([]byte, error) {
	r.calls++
	if r.fail {
		return nil, errors.New("gotenberg down")
	}
	return fmt.Appendf(nil, "%%PDF-1.7 render %d", r.calls), nil
}

func TestOneCurrentReportPerVersion(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	pool := testutil.NewDB(t)
	objects := startRustFS(t)

	owner := testutil.NewAccount(t, pool)
	proj := testutil.NewProject(t, pool, owner.ID)
	v := testutil.NewVersionWithSnapshot(t, pool, proj.ID)
	var code string
	if err := pool.QueryRow(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code); err != nil {
		t.Fatal(err)
	}
	testutil.NewAnswer(t, pool, v.ID, code)
	testutil.NewResult(t, pool, v.ID, code) // H, so it takes a strategy
	testutil.SubmitVersion(t, pool, v.ID)
	ownerID, projectID, versionID := uuid.MustParse(owner.ID), uuid.MustParse(proj.ID), uuid.MustParse(v.ID)

	js := jobs.New(pool, nopEnqueuer{})
	svc := reports.New(pool, pool, js, objects, nil)
	render := &countingRenderer{}
	srv := &oneServer{}
	rt := runtime.New(js, srv, slog.New(slog.NewTextHandler(io.Discard, nil)))
	rt.Register(jobs.KindReport, report.NewRunner(report.NewStore(pool), render, objects))

	request := func() uuid.UUID {
		t.Helper()
		id, err := svc.Request(ctx, ownerID, projectID, versionID)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	work := func(id uuid.UUID) {
		t.Helper()
		if err := srv.h(ctx, string(jobs.KindReport), []byte(id.String())); err != nil {
			t.Fatal(err)
		}
	}
	downloads := func(id uuid.UUID) error {
		t.Helper()
		f, err := svc.Download(ctx, ownerID, id)
		if err == nil {
			_ = f.Body.Close()
		}
		return err
	}
	stored := func(id uuid.UUID) bool {
		t.Helper()
		ok, err := objects.Exists(ctx, jobs.ObjectKey(jobs.KindReport, id))
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}
	status := func(id uuid.UUID) string {
		t.Helper()
		var s string
		if err := pool.QueryRow(ctx, `SELECT status::text FROM job WHERE id = $1`, id).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}

	// Two downloads with no change: one render, same object.
	first := request()
	work(first)
	if again := request(); again != first {
		t.Fatalf("unchanged version got a new job %v, want %v", again, first)
	}
	if render.calls != 1 || !stored(first) || downloads(first) != nil {
		t.Fatalf("calls = %d stored = %v", render.calls, stored(first))
	}

	// A strategy change renders again and the first object is deleted.
	if _, err := pool.Exec(ctx, `INSERT INTO strategy_choice (version_id, indicator_code, strategy)
		VALUES ($1, $2, 'REDUCE')`, v.ID, code); err != nil {
		t.Fatal(err)
	}
	second := request()
	if second == first {
		t.Fatal("strategy change reused the old report")
	}
	if !stored(first) || downloads(first) != nil {
		t.Fatal("old report gone before the new one is done")
	}
	work(second)
	if render.calls != 2 || !stored(second) || downloads(second) != nil {
		t.Fatalf("calls = %d, new report not downloadable", render.calls)
	}
	if stored(first) {
		t.Fatal("replaced object still exists")
	}
	if got := status(first); got != "expired" {
		t.Fatalf("replaced job status = %s, want expired (row kept)", got)
	}
	if err := downloads(first); !errors.Is(err, reports.ErrNotReady) {
		t.Fatalf("replaced job download err = %v, want ErrNotReady", err)
	}

	// A project edit needs a new render; when it fails, the previous file
	// still downloads and is kept.
	if _, err := pool.Exec(ctx, `UPDATE project SET name = name || ' 2', updated_at = now() WHERE id = $1`, proj.ID); err != nil {
		t.Fatal(err)
	}
	render.fail = true
	third := request()
	if third == second {
		t.Fatal("project edit reused the old report")
	}
	work(third)
	if got := status(third); got != "failed" {
		t.Fatalf("third status = %s, want failed", got)
	}
	if !stored(second) || downloads(second) != nil || status(second) != "done" {
		t.Fatal("a failed render lost the previous report")
	}

	// Asking again after the failure renders again and then replaces.
	render.fail = false
	fourth := request()
	if fourth == second || fourth == third {
		t.Fatalf("retry reused %v", fourth)
	}
	work(fourth)
	if stored(second) || !stored(fourth) || downloads(fourth) != nil {
		t.Fatal("retry did not replace the previous report")
	}
}

// Only done reports with a newer done report of the same version are
// replaced; the current one, failed and expired rows and other versions are
// left alone, and the job may list itself when a newer one finished first.
func TestReplacedListsOnlyOlderDoneReports(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	pool := testutil.NewDB(t)
	owner := testutil.NewAccount(t, pool)
	proj := testutil.NewProject(t, pool, owner.ID)
	v := testutil.NewVersionWithSnapshot(t, pool, proj.ID)
	testutil.SubmitVersion(t, pool, v.ID)
	other := testutil.NewVersionWithSnapshot(t, pool, proj.ID)
	testutil.SubmitVersion(t, pool, other.ID)

	at := time.Date(2026, 11, 27, 9, 0, 0, 0, time.UTC)
	add := func(version, status string, minute int) uuid.UUID {
		t.Helper()
		id := uuid.New()
		created := at.Add(time.Duration(minute) * time.Minute)
		var key any
		if status == "done" || status == "expired" {
			key = jobs.ObjectKey(jobs.KindReport, id)
		}
		var errMsg any
		if status == "failed" {
			errMsg = "boom"
		}
		if _, err := pool.Exec(ctx, `INSERT INTO job (id, kind, requested_by, status, object_key, error,
			created_at, started_at, finished_at)
			VALUES ($1, 'report', $2, $3::job_status, $4, $5, $6, $6, $6)`,
			id, owner.ID, status, key, errMsg, created); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO report_job (job_id, version_id, submission_no) VALUES ($1, $2, 1)`, id, version); err != nil {
			t.Fatal(err)
		}
		return id
	}
	oldDone := add(v.ID, "done", 1)
	add(v.ID, "expired", 0)
	current := add(v.ID, "done", 2)
	add(v.ID, "failed", 3)
	otherDone := add(other.ID, "done", 0)

	st := report.NewStore(pool)
	for _, from := range []uuid.UUID{current, oldDone} {
		got, err := st.Replaced(ctx, from)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 || got[0].JobID != oldDone || got[0].ObjectKey != jobs.ObjectKey(jobs.KindReport, oldDone) {
			t.Fatalf("from %v: replaced = %+v, want only %v", from, got, oldDone)
		}
	}
	if got, err := st.Replaced(ctx, otherDone); err != nil || len(got) != 0 {
		t.Fatalf("other version: replaced = %+v err = %v", got, err)
	}
	if ok, err := st.MarkReplaced(ctx, oldDone); err != nil || !ok {
		t.Fatalf("mark: ok = %v err = %v", ok, err)
	}
	if ok, err := st.MarkReplaced(ctx, oldDone); err != nil || ok {
		t.Fatalf("second mark: ok = %v err = %v, want false", ok, err)
	}
	if got, err := st.Replaced(ctx, current); err != nil || len(got) != 0 {
		t.Fatalf("after mark: replaced = %+v err = %v", got, err)
	}
}
