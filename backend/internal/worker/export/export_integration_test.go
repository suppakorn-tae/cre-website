package export_test

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/export"
)

// newExportJob inserts a job and its export_job row; chosen accounts make a
// "selected" export.
func newExportJob(t *testing.T, db testutil.DB, requester string, includeDeleted bool, chosen ...string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	scope := "all"
	if len(chosen) > 0 {
		scope = "selected"
	}
	if _, err := db.Exec(ctx, `INSERT INTO job (id, kind, requested_by) VALUES ($1, 'export', $2)`, id, requester); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO export_job (job_id, scope, include_deleted) VALUES ($1, $2::export_scope, $3)`, id, scope, includeDeleted); err != nil {
		t.Fatal(err)
	}
	for _, a := range chosen {
		if _, err := db.Exec(ctx, `INSERT INTO export_job_account (job_id, account_id) VALUES ($1, $2)`, id, a); err != nil {
			t.Fatal(err)
		}
	}
	return id
}

func TestResearchExportHidesIdentityAndHonoursScope(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)

	alice := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Email = "alice.secret@example.test"; a.Pseudonym = "user-alice001" })
	bob := testutil.NewAccount(t, db, func(a *testutil.Account) { a.Email = "bob.secret@example.test"; a.Pseudonym = "user-bob00002" })
	if _, err := db.Exec(ctx, `UPDATE account SET google_sub = 'google-sub-123456789', organisation = 'บริษัท ทดสอบ' WHERE id = $1`, alice.ID); err != nil {
		t.Fatal(err)
	}

	var code string
	if err := db.QueryRow(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 1`).Scan(&code); err != nil {
		t.Fatal(err)
	}
	live := testutil.NewProject(t, db, alice.ID)
	gone := testutil.NewProject(t, db, alice.ID, func(p *testutil.Project) { p.Nickname = "GONE" })
	for _, p := range []testutil.Project{live, gone} {
		v := testutil.NewVersionWithSnapshot(t, db, p.ID)
		testutil.NewAnswer(t, db, v.ID, code)
		testutil.NewResult(t, db, v.ID, code)
		testutil.SubmitVersion(t, db, v.ID)
	}
	if _, err := db.Exec(ctx, `UPDATE project SET deleted_at = now() WHERE id = $1`, gone.ID); err != nil {
		t.Fatal(err)
	}
	testutil.NewProject(t, db, bob.ID, func(p *testutil.Project) { p.Nickname = "BOBS" })

	build := func(job uuid.UUID) (string, map[string][]byte) {
		var buf bytes.Buffer
		if err := export.Build(ctx, export.NewRepository(db), job, &buf); err != nil {
			t.Fatal(err)
		}
		files := unzip(t, buf.Bytes())
		var all strings.Builder
		for n, b := range files {
			all.WriteString(n + "\n" + string(b) + "\n")
		}
		return all.String(), files
	}

	// All accounts, deleted projects included.
	text, files := build(newExportJob(t, db, alice.ID, true))
	for _, secret := range []string{alice.Email, bob.Email, "google-sub-123456789", "@example.test", alice.ID, bob.ID} {
		if strings.Contains(text, secret) {
			t.Fatalf("the ZIP leaks %q", secret)
		}
	}
	for _, want := range []string{
		"user-alice001/user.json", "user-bob00002/user.json",
		"user-alice001/GONE_" + gone.ID + "/project.json", "user-alice001/" + live.Nickname + "_" + live.ID + "/version-1.csv",
	} {
		if _, ok := files[want]; !ok {
			t.Fatalf("missing %s", want)
		}
	}
	if csv := string(files["user-alice001/"+live.Nickname+"_"+live.ID+"/version-1.csv"]); !strings.HasPrefix(csv, "\xEF\xBB\xBFindicator,") || !strings.Contains(csv, code+",10,") {
		t.Fatalf("CSV wrong:\n%s", csv)
	}

	// Selected account only, deleted projects left out.
	_, files = build(newExportJob(t, db, alice.ID, false, alice.ID))
	if _, ok := files["user-bob00002/user.json"]; ok {
		t.Fatal("an account that was not chosen must not appear")
	}
	if _, ok := files["user-alice001/GONE_"+gone.ID+"/project.json"]; ok {
		t.Fatal("a soft-deleted project must not appear unless asked for")
	}
	if _, ok := files["user-alice001/"+live.Nickname+"_"+live.ID+"/project.json"]; !ok {
		t.Fatal("the live project must appear")
	}

	// The runner path stores the object under the export key.
	st := &memStore{}
	job := newExportJob(t, db, alice.ID, false)
	if err := export.NewRunner(export.NewRepository(db), st)(ctx, jobs.Job{ID: job, Kind: jobs.KindExport}); err != nil {
		t.Fatal(err)
	}
	if len(st.data["exports/"+job.String()+".zip"]) == 0 {
		t.Fatal("runner stored nothing")
	}
}
