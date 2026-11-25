package export_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/export"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type enq struct{ sent *[]string }

func (e enq) Enqueue(_ context.Context, kind string, payload []byte, q string) error {
	*e.sent = append(*e.sent, kind+" "+string(payload)+" "+q)
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
	svc     *export.Service
	jobs    *jobs.Service
	sent    *[]string
	files   store
	ctx     context.Context
	adminID uuid.UUID
}

func setup(t *testing.T) env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	acc := testutil.NewAccount(t, pool, func(a *testutil.Account) { a.Role = "admin" })
	adminID := uuid.MustParse(acc.ID)
	ctx := audit.WithClientIP(audit.WithAdmin(log.WithRequestID(context.Background(), "req-1"), adminID), "203.0.113.7")
	sent := &[]string{}
	js := jobs.New(pool, enq{sent})
	files := store{}
	return env{
		pool: pool, jobs: js, sent: sent, files: files, ctx: ctx, adminID: adminID,
		svc: export.New(pool, pool, js, audit.New(audit.NewRepository()), files, nil),
	}
}

func count(t *testing.T, db *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// finish marks a queued export done with the given expiry.
func finish(t *testing.T, e env, id uuid.UUID, expires time.Time) {
	t.Helper()
	_, err := e.pool.Exec(context.Background(), `UPDATE job SET status = 'done', started_at = now(), finished_at = now(),
		object_key = $2, expires_at = $3 WHERE id = $1`, id, jobs.ObjectKey(jobs.KindExport, id), expires)
	if err != nil {
		t.Fatal(err)
	}
}

func TestRequestWritesRowsAuditAndEnqueues(t *testing.T) {
	e := setup(t)
	u1, u2 := testutil.NewAccount(t, e.pool), testutil.NewAccount(t, e.pool)
	id, err := e.svc.Request(e.ctx, e.adminID, export.Params{
		Scope: export.ScopeSelected, IncludeDeleted: true,
		UserIDs: []uuid.UUID{uuid.MustParse(u1.ID), uuid.MustParse(u2.ID)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if n := count(t, e.pool, `SELECT count(*) FROM job WHERE id = $1 AND kind = 'export' AND status = 'queued' AND requested_by = $2`, id, e.adminID); n != 1 {
		t.Fatalf("job rows = %d", n)
	}
	if n := count(t, e.pool, `SELECT count(*) FROM export_job WHERE job_id = $1 AND scope = 'selected' AND include_deleted`, id); n != 1 {
		t.Fatalf("export_job rows = %d", n)
	}
	if n := count(t, e.pool, `SELECT count(*) FROM export_job_account WHERE job_id = $1`, id); n != 2 {
		t.Fatalf("export_job_account rows = %d", n)
	}
	if n := count(t, e.pool, `SELECT count(*) FROM audit_log WHERE action = 'export_request' AND target_id = $1 AND admin_id = $2`, id.String(), e.adminID); n != 1 {
		t.Fatalf("audit rows = %d", n)
	}
	if len(*e.sent) != 1 || !strings.HasSuffix((*e.sent)[0], " exports") {
		t.Fatalf("enqueued %v", *e.sent)
	}
}

func TestRequestAllScopeHasNoAccountRows(t *testing.T) {
	e := setup(t)
	id, err := e.svc.Request(e.ctx, e.adminID, export.Params{Scope: export.ScopeAll})
	if err != nil {
		t.Fatal(err)
	}
	if n := count(t, e.pool, `SELECT count(*) FROM export_job_account WHERE job_id = $1`, id); n != 0 {
		t.Fatalf("account rows = %d", n)
	}
}

func TestRequestUnknownUserWritesNothing(t *testing.T) {
	e := setup(t)
	_, err := e.svc.Request(e.ctx, e.adminID, export.Params{Scope: export.ScopeSelected, UserIDs: []uuid.UUID{uuid.New()}})
	var v admin.ValidationError
	if !errors.As(err, &v) || v[0].Code != export.CodeNotFound {
		t.Fatalf("err = %v", err)
	}
	if count(t, e.pool, `SELECT count(*) FROM job WHERE kind = 'export'`) != 0 ||
		count(t, e.pool, `SELECT count(*) FROM audit_log WHERE action = 'export_request'`) != 0 || len(*e.sent) != 0 {
		t.Fatal("a rejected request left rows or a task")
	}
}

func TestRequestAuditFailureRollsBack(t *testing.T) {
	e := setup(t)
	// No admin in the context: the audit write fails, so the job must not stay.
	_, err := e.svc.Request(log.WithRequestID(context.Background(), "req-2"), e.adminID, export.Params{Scope: export.ScopeAll})
	if !errors.Is(err, audit.ErrNoAdmin) {
		t.Fatalf("err = %v", err)
	}
	if count(t, e.pool, `SELECT count(*) FROM job WHERE kind = 'export'`) != 0 || len(*e.sent) != 0 {
		t.Fatal("job survived a failed audit write")
	}
}

func TestEachDownloadAddsOneAuditRow(t *testing.T) {
	e := setup(t)
	id, err := e.svc.Request(e.ctx, e.adminID, export.Params{Scope: export.ScopeAll})
	if err != nil {
		t.Fatal(err)
	}
	finish(t, e, id, time.Now().Add(time.Hour))
	e.files[jobs.ObjectKey(jobs.KindExport, id)] = "zip"
	for i := 1; i <= 2; i++ {
		f, err := e.svc.Download(e.ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(f.Body)
		_ = f.Body.Close()
		if string(b) != "zip" {
			t.Fatalf("body = %q", b)
		}
		if n := count(t, e.pool, `SELECT count(*) FROM audit_log WHERE action = 'export_download' AND target_id = $1`, id.String()); n != i {
			t.Fatalf("after %d downloads: %d audit rows", i, n)
		}
	}
}

func TestDownloadRefusals(t *testing.T) {
	e := setup(t)
	mk := func() uuid.UUID {
		id, err := e.svc.Request(e.ctx, e.adminID, export.Params{Scope: export.ScopeAll})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	queued, expired, swept, missing := mk(), mk(), mk(), mk()
	finish(t, e, expired, time.Now().Add(-time.Minute))
	e.files[jobs.ObjectKey(jobs.KindExport, expired)] = "zip"
	finish(t, e, swept, time.Now().Add(-time.Minute))
	if _, err := e.pool.Exec(context.Background(), `UPDATE job SET status = 'expired' WHERE id = $1`, swept); err != nil {
		t.Fatal(err)
	}
	finish(t, e, missing, time.Now().Add(time.Hour))

	for name, tc := range map[string]struct {
		id   uuid.UUID
		want error
	}{
		"queued":          {queued, export.ErrNotReady},
		"past expires_at": {expired, export.ErrExpired},
		"swept":           {swept, export.ErrExpired},
		"file missing":    {missing, export.ErrFileMissing},
		"unknown":         {uuid.New(), export.ErrNotFound},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := e.svc.Download(e.ctx, tc.id); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
	if n := count(t, e.pool, `SELECT count(*) FROM audit_log WHERE action = 'export_download'`); n != 0 {
		t.Fatalf("refused downloads wrote %d audit rows", n)
	}
}

func TestDownloadOfReportJobIsNotFound(t *testing.T) {
	e := setup(t)
	j, err := e.jobs.Create(e.ctx, jobs.KindReport, e.adminID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Download(e.ctx, j.ID); !errors.Is(err, export.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}
