package reports_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/queue"
	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type recorder struct {
	mu   sync.Mutex
	sent []string
}

type enq struct{ *recorder }

func (e enq) Enqueue(_ context.Context, kind string, payload []byte, q string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.sent = append(e.sent, kind+" "+string(payload)+" "+q)
	return nil
}

type store map[string]string

func (s store) Get(_ context.Context, key string) (io.ReadCloser, error) {
	v, ok := s[key]
	if !ok {
		return nil, s3.ErrNotFound
	}
	return io.NopCloser(strings.NewReader(v)), nil
}

type env struct {
	pool    *pgxpool.Pool
	svc     *reports.Service
	rec     *recorder
	files   store
	owner   uuid.UUID
	project uuid.UUID
}

func setup(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	rec := &recorder{}
	files := store{}
	acct := testutil.NewAccount(t, pool)
	proj := testutil.NewProject(t, pool, acct.ID)
	return env{
		pool: pool, rec: rec, files: files,
		svc:   reports.New(pool, pool, jobs.New(pool, enq{rec}), files, nil),
		owner: uuid.MustParse(acct.ID), project: uuid.MustParse(proj.ID),
	}
}

// submitted adds a submitted version with one result.
func (e env) submitted(t *testing.T) uuid.UUID {
	t.Helper()
	v := testutil.NewVersionWithSnapshot(t, e.pool, e.project.String())
	var code string
	if err := e.pool.QueryRow(context.Background(), `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code); err != nil {
		t.Fatal(err)
	}
	testutil.NewAnswer(t, e.pool, v.ID, code)
	testutil.NewResult(t, e.pool, v.ID, code)
	testutil.SubmitVersion(t, e.pool, v.ID)
	return uuid.MustParse(v.ID)
}

func (e env) softDeleteVersion(t *testing.T, id uuid.UUID) {
	t.Helper()
	if _, err := e.pool.Exec(context.Background(), `UPDATE assessment_version SET deleted_at = now() WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
}

func TestRequestCreatesJobOnceAndEnqueues(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	v := e.submitted(t)

	id, err := e.svc.Request(ctx, e.owner, e.project, v)
	if err != nil {
		t.Fatal(err)
	}
	again, err := e.svc.Request(ctx, e.owner, e.project, v)
	if err != nil || again != id {
		t.Fatalf("repeat: id = %v err = %v, want %v", again, err, id)
	}
	if len(e.rec.sent) != 1 || e.rec.sent[0] != "report "+id.String()+" "+queue.Reports {
		t.Fatalf("sent = %v", e.rec.sent)
	}
}

func TestRequestDraftIsNotSubmitted(t *testing.T) {
	e := setup(t)
	v := testutil.NewVersionWithSnapshot(t, e.pool, e.project.String())
	_, err := e.svc.Request(context.Background(), e.owner, e.project, uuid.MustParse(v.ID))
	if !errors.Is(err, reports.ErrNotSubmitted) {
		t.Fatalf("err = %v, want ErrNotSubmitted", err)
	}
}

func TestRequestDeletedOrForeignIsNotFound(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	v := e.submitted(t)
	if _, err := e.svc.Request(ctx, uuid.New(), e.project, v); !errors.Is(err, reports.ErrNotFound) {
		t.Fatalf("other account: err = %v", err)
	}
	e.softDeleteVersion(t, v)
	if _, err := e.svc.Request(ctx, e.owner, e.project, v); !errors.Is(err, reports.ErrNotFound) {
		t.Fatalf("deleted: err = %v", err)
	}
}

func TestDownloadStatesAndOwnerCheck(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	v := e.submitted(t)
	id, err := e.svc.Request(ctx, e.owner, e.project, v)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Download(ctx, e.owner, id); !errors.Is(err, reports.ErrNotReady) {
		t.Fatalf("queued: err = %v, want ErrNotReady", err)
	}

	js := jobs.New(e.pool, enq{e.rec})
	j, err := js.MarkRunning(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if err := js.MarkDone(ctx, j); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Download(ctx, e.owner, id); !errors.Is(err, reports.ErrFileMissing) {
		t.Fatalf("no file: err = %v, want ErrFileMissing", err)
	}

	e.files[jobs.ObjectKey(jobs.KindReport, id)] = "%PDF"
	f, err := e.svc.Download(ctx, e.owner, id)
	if err != nil {
		t.Fatal(err)
	}
	_ = f.Body.Close()
	if !strings.HasPrefix(f.Disposition, "attachment;") || !strings.Contains(f.Disposition, ".pdf") {
		t.Fatalf("disposition = %q", f.Disposition)
	}

	if _, err := e.svc.Download(ctx, uuid.New(), id); !errors.Is(err, reports.ErrNotFound) {
		t.Fatalf("other account: err = %v, want ErrNotFound", err)
	}
	e.softDeleteVersion(t, v)
	if _, err := e.svc.Download(ctx, e.owner, id); !errors.Is(err, reports.ErrNotFound) {
		t.Fatalf("deleted version: err = %v, want ErrNotFound", err)
	}
}
