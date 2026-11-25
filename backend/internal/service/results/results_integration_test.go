package results_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/results"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

type fixture struct {
	db          *pgxpool.Pool
	svc         *results.Service
	owner       uuid.UUID
	project     uuid.UUID
	version     uuid.UUID
	high, mid   string // indicator codes of an H and an M result
	adviceItems []string
}

// setup submits version 1 of an owned project with one H and one M result.
// The H result has the RL list stored, with two items.
func setup(t *testing.T) fixture {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	db := testutil.NewDB(t)
	acct := testutil.NewAccount(t, db)
	proj := testutil.NewProject(t, db, acct.ID)
	v := testutil.NewVersionWithSnapshot(t, db, proj.ID)

	f := fixture{
		db: db, svc: results.New(db), owner: uuid.MustParse(acct.ID),
		project: uuid.MustParse(proj.ID), version: uuid.MustParse(v.ID),
	}
	rows, err := db.Query(ctx, `SELECT code FROM indicator ORDER BY code LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	var codes []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			t.Fatal(err)
		}
		codes = append(codes, c)
	}
	rows.Close()
	f.high, f.mid = codes[0], codes[1]

	for _, c := range codes {
		testutil.NewAnswer(t, db, v.ID, c)
	}
	testutil.NewResult(t, db, v.ID, f.high)
	testutil.NewResult(t, db, v.ID, f.mid, func(r *testutil.Result) { r.RM, r.Level = "3", "M" })
	testutil.SubmitVersion(t, db, v.ID)

	// Two admin-defined items for the RL list, Thai only; the list is stored
	// with the result, the text is not.
	exec(t, db, `DELETE FROM advice_item WHERE indicator_code = $1 AND list = 'RL'`, f.high)
	for pos := 1; pos <= 2; pos++ {
		id := testutil.NewID()
		exec(t, db, `INSERT INTO advice_item (id, indicator_code, list, position) VALUES ($1, $2, 'RL', $3)`, id, f.high, pos)
		exec(t, db, `INSERT INTO advice_item_text (item_id, locale, text) VALUES ($1, 'th', $2)`, id, "ข้อ "+string(rune('0'+pos)))
		f.adviceItems = append(f.adviceItems, id)
	}
	exec(t, db, `INSERT INTO result_advice_list (version_id, indicator_code, list) VALUES ($1, $2, 'RL')`, v.ID, f.high)
	return f
}

func exec(t *testing.T, db *pgxpool.Pool, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(context.Background(), q, args...); err != nil {
		t.Fatal(err)
	}
}

func TestGetReturnsStoredResultsWithCounts(t *testing.T) {
	f := setup(t)
	res, err := f.svc.Get(context.Background(), f.project, f.version, f.owner)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Editable || len(res.Items) != 2 || res.LevelCounts["H"] != 1 || res.LevelCounts["M"] != 1 || res.LevelCounts["VH"] != 0 {
		t.Fatalf("results = %+v", res)
	}
	h := byCode(res, f.high)
	if h.Level != "H" || h.Strategy != nil || !reflect.DeepEqual(h.Advice, []results.Advice{{List: "RL", Items: []string{"ข้อ 1", "ข้อ 2"}}}) {
		t.Fatalf("high indicator = %+v", h)
	}
}

func TestEditedAdviceShowsWithoutResubmitting(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	exec(t, f.db, `UPDATE advice_item_text SET text = 'แก้แล้ว' WHERE item_id = $1`, f.adviceItems[0])
	// An en text must never be served: v1 reads th only.
	exec(t, f.db, `INSERT INTO locale (code) VALUES ('en') ON CONFLICT DO NOTHING`)
	exec(t, f.db, `INSERT INTO advice_item_text (item_id, locale, text) VALUES ($1, 'en', 'edited')`, f.adviceItems[0])

	res, err := f.svc.Get(ctx, f.project, f.version, f.owner)
	if err != nil {
		t.Fatal(err)
	}
	if got := byCode(res, f.high).Advice[0].Items[0]; got != "แก้แล้ว" {
		t.Fatalf("th text = %q", got)
	}
}

func TestOtherAccountAndDraftLookAbsent(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	if _, err := f.svc.Get(ctx, f.project, f.version, uuid.New()); !errors.Is(err, results.ErrNotFound) {
		t.Fatalf("other owner: err = %v, want ErrNotFound", err)
	}
	if _, err := f.svc.SetStrategy(ctx, f.project, f.version, uuid.New(), f.high, "REDUCE"); !errors.Is(err, results.ErrNotFound) {
		t.Fatalf("other owner strategy: err = %v, want ErrNotFound", err)
	}
	draft := testutil.NewVersionWithSnapshot(t, f.db, f.project.String())
	if _, err := f.svc.Get(ctx, f.project, uuid.MustParse(draft.ID), f.owner); !errors.Is(err, results.ErrNotFound) {
		t.Fatalf("draft: err = %v, want ErrNotFound", err)
	}
}

func TestSetStrategyOnlyForHighRiskOnLatestVersion(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	c, err := f.svc.SetStrategy(ctx, f.project, f.version, f.owner, f.high, "REDUCE")
	if err != nil || c.Strategy != "REDUCE" {
		t.Fatalf("set = %+v, err %v", c, err)
	}
	if c, err = f.svc.SetStrategy(ctx, f.project, f.version, f.owner, f.high, "ACCEPT"); err != nil || c.Strategy != "ACCEPT" {
		t.Fatalf("change = %+v, err %v", c, err)
	}
	res, err := f.svc.Get(ctx, f.project, f.version, f.owner)
	if err != nil {
		t.Fatal(err)
	}
	if s := byCode(res, f.high).Strategy; s == nil || *s != "ACCEPT" || byCode(res, f.high).StrategyUpdatedAt == nil {
		t.Fatalf("stored strategy = %v", s)
	}

	if _, err := f.svc.SetStrategy(ctx, f.project, f.version, f.owner, f.mid, "REDUCE"); !errors.Is(err, results.ErrNotHighRisk) {
		t.Fatalf("M indicator: err = %v, want ErrNotHighRisk", err)
	}
	if _, err := f.svc.SetStrategy(ctx, f.project, f.version, f.owner, f.high, "IGNORE"); !errors.Is(err, results.ErrInvalidStrategy) {
		t.Fatalf("bad strategy: err = %v, want ErrInvalidStrategy", err)
	}
	if _, err := f.svc.SetStrategy(ctx, f.project, f.version, f.owner, "ZZ-ZZ-9", "REDUCE"); !errors.Is(err, results.ErrNotFound) {
		t.Fatalf("unknown indicator: err = %v, want ErrNotFound", err)
	}

	testutil.NewVersionWithSnapshot(t, f.db, f.project.String())
	if _, err := f.svc.SetStrategy(ctx, f.project, f.version, f.owner, f.high, "AVOID"); !errors.Is(err, results.ErrNotLatest) {
		t.Fatalf("old version: err = %v, want ErrNotLatest", err)
	}
	res, err = f.svc.Get(ctx, f.project, f.version, f.owner)
	if err != nil || res.Editable {
		t.Fatalf("old version editable = %v, err %v", res.Editable, err)
	}
}

func byCode(r results.Results, code string) results.Indicator {
	for _, it := range r.Items {
		if it.Code == code {
			return it
		}
	}
	return results.Indicator{}
}
