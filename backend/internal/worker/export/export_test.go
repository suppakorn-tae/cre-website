package export_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/export"
)

type fakeSource struct {
	opt      export.Options
	accounts []export.Account
	projects map[uuid.UUID][]export.Project
}

func (f *fakeSource) Options(context.Context, uuid.UUID) (export.Options, error) { return f.opt, nil }

func (f *fakeSource) Accounts(context.Context, uuid.UUID, bool) ([]export.Account, error) {
	return f.accounts, nil
}

func (f *fakeSource) Projects(_ context.Context, o uuid.UUID, _ bool) ([]export.Project, error) {
	return f.projects[o], nil
}

func fixture() (*fakeSource, uuid.UUID) {
	acct := uuid.New()
	org := "บริษัท ก่อสร้างเกาะ จำกัด"
	pid := uuid.New()
	del := time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC)
	return &fakeSource{
		opt:      export.Options{All: true, IncludeDeleted: true},
		accounts: []export.Account{{ID: acct, Pseudonym: "user-abc12345", Organisation: &org}},
		projects: map[uuid.UUID][]export.Project{acct: {{
			ID: pid, Name: "โครงการท่าเรือ", Nickname: "ท่า/1", ValueBaht: "100000000.00", DeletedAt: &del,
			Versions: []export.Version{{
				ID: uuid.New(), VersionNo: 1, Status: "submitted", DeletedAt: &del,
				Rows: []export.IndicatorRow{{
					Code: "EC-HS-1", X: "10", XUnit: "คน", Y1: "1000", Y1Unit: "baht", Y2: "30", Y2Unit: "day",
					Y3Options: "A,B", RL: "3", RIC: "4", RIT: "2", RIE: "3", RIMax: "4", RM: "4", Level: "H", Strategy: "REDUCE",
				}},
			}, {ID: uuid.New(), VersionNo: 2, Status: "draft"}},
		}}},
	}, pid
}

func unzip(t *testing.T, b []byte) map[string][]byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	out := map[string][]byte{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(rc)
		_ = rc.Close()
		out[f.Name] = data
	}
	return out
}

func TestBuildLayoutAndThaiCSV(t *testing.T) {
	src, pid := fixture()
	var buf bytes.Buffer
	if err := export.Build(context.Background(), src, uuid.New(), &buf); err != nil {
		t.Fatal(err)
	}
	files := unzip(t, buf.Bytes())
	var names []string
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	dir := "user-abc12345/ท่า_1_" + pid.String() + "/"
	want := []string{"user-abc12345/user.json", dir + "project.json", dir + "version-1.csv", dir + "version-2.csv"}
	sort.Strings(want)
	if strings.Join(names, "|") != strings.Join(want, "|") {
		t.Fatalf("entries = %v, want %v", names, want)
	}

	csvBytes := files[dir+"version-1.csv"]
	if !bytes.HasPrefix(csvBytes, []byte{0xEF, 0xBB, 0xBF}) {
		t.Fatal("CSV must start with a UTF-8 BOM")
	}
	if !strings.Contains(string(csvBytes), "คน") || !strings.Contains(string(csvBytes), "EC-HS-1,10,คน,1000,baht,30,day,\"A,B\",3,4,2,3,4,4,H,REDUCE") {
		t.Fatalf("CSV row missing or garbled:\n%s", csvBytes)
	}
	if !strings.HasPrefix(string(files[dir+"version-2.csv"]), "\xEF\xBB\xBFindicator,") {
		t.Fatal("an empty version still gets a header with BOM")
	}

	var proj map[string]any
	if err := json.Unmarshal(files[dir+"project.json"], &proj); err != nil {
		t.Fatalf("project.json: %v", err)
	}
	vs := proj["versions"].([]any)
	if len(vs) != 2 || vs[0].(map[string]any)["deleted_at"] == nil || proj["deleted_at"] == nil {
		t.Fatalf("project.json must carry versions and deleted_at: %s", files[dir+"project.json"])
	}
	if !strings.Contains(string(files["user-abc12345/user.json"]), "บริษัท ก่อสร้างเกาะ จำกัด") {
		t.Fatal("user.json must carry the organisation")
	}
}

type memStore struct {
	data map[string][]byte
	err  error
}

func (m *memStore) Put(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	if m.err != nil {
		return m.err
	}
	b, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	if m.data == nil {
		m.data = map[string][]byte{}
	}
	m.data[key] = b
	return nil
}

func TestRunnerStreamsToExportKeyAndIsIdempotent(t *testing.T) {
	src, _ := fixture()
	st := &memStore{}
	run := export.NewRunner(src, st)
	job := jobs.Job{ID: uuid.New(), Kind: jobs.KindExport}
	if err := run(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	key := "exports/" + job.ID.String() + ".zip"
	first := st.data[key]
	if len(first) == 0 {
		t.Fatalf("nothing stored under %s", key)
	}
	if err := run(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if len(st.data) != 1 || !bytes.Equal(first, st.data[key]) {
		t.Fatal("a second run must overwrite the same object with the same bytes")
	}
}

func TestRunnerErrors(t *testing.T) {
	src, _ := fixture()
	boom := errors.New("s3 down")
	if err := export.NewRunner(src, &memStore{err: boom})(context.Background(), jobs.Job{ID: uuid.New(), Kind: jobs.KindExport}); !errors.Is(err, boom) {
		t.Fatalf("store failure must surface, got %v", err)
	}
	if err := export.NewRunner(src, &memStore{})(context.Background(), jobs.Job{ID: uuid.New(), Kind: jobs.KindReport}); err == nil {
		t.Fatal("a report job must be refused")
	}
}

// blockingStore waits for its context, like an upload that hangs.
type blockingStore struct{}

func (blockingStore) Put(ctx context.Context, _ string, r io.Reader, _ int64, _ string) error {
	go func() { _, _ = io.Copy(io.Discard, r) }()
	<-ctx.Done()
	return ctx.Err()
}

func TestRunnerTimesOut(t *testing.T) {
	src, _ := fixture()
	run := export.NewRunner(src, blockingStore{}, export.WithTimeout(50*time.Millisecond))
	start := time.Now()
	err := run(context.Background(), jobs.Job{ID: uuid.New(), Kind: jobs.KindExport})
	if err == nil || !strings.Contains(err.Error(), "timed out after 50ms") {
		t.Fatalf("err = %v, want a time-out error", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatalf("took %s", time.Since(start))
	}
}

func TestRunnerShutdownIsNotATimeout(t *testing.T) {
	src, _ := fixture()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	run := export.NewRunner(src, blockingStore{})
	err := run(ctx, jobs.Job{ID: uuid.New(), Kind: jobs.KindExport})
	if err == nil || strings.Contains(err.Error(), "timed out") {
		t.Fatalf("err = %v, want a plain cancel", err)
	}
}
