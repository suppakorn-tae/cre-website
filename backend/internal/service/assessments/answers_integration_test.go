package assessments_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

const indicator = "EC-HS-2"

type world struct {
	pool    *pgxpool.Pool
	s       *svc.AnswerService
	owner   uuid.UUID
	project uuid.UUID
	v1      uuid.UUID
}

func setup(t *testing.T) world {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	pool := testutil.NewDB(t)
	acct := testutil.NewAccount(t, pool)
	p := testutil.NewProject(t, pool, acct.ID)
	v1 := testutil.NewVersionWithSnapshot(t, pool, p.ID)
	return world{
		pool: pool, s: svc.NewAnswerService(pool), owner: uuid.MustParse(acct.ID),
		project: uuid.MustParse(p.ID), v1: uuid.MustParse(v1.ID),
	}
}

func (w world) upsert(in ...svc.AnswerInput) (svc.AnswerList, error) {
	return w.s.Upsert(context.Background(), w.owner, w.project, w.v1, in, at)
}

func TestUpsertStoresAsEnteredAndClears(t *testing.T) {
	w := setup(t)
	full := svc.AnswerInput{
		IndicatorCode: indicator, X: f(0.1),
		Y1: &svc.Impact{Value: 12.5, Unit: "percent"}, Y2: &svc.Impact{Value: 30, Unit: "day"},
		Y3: []string{"B", "C"},
	}
	l, err := w.upsert(full)
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Items) != 1 || !l.Items[0].Complete || *l.Items[0].X != 0.1 || len(l.Items[0].Y3) != 2 || !l.Editable {
		t.Fatalf("saved = %+v", l)
	}

	// Partial replacement clears the omitted fields, including y3.
	l, err = w.upsert(svc.AnswerInput{IndicatorCode: indicator, X: f(7)})
	if err != nil {
		t.Fatal(err)
	}
	a := l.Items[0]
	if a.Complete || a.Y1 != nil || a.Y2 != nil || len(a.Y3) != 0 || *a.X != 7 {
		t.Fatalf("after clear = %+v", a)
	}
	got, err := w.s.List(context.Background(), w.owner, w.project, w.v1)
	if err != nil || len(got.Items) != 1 {
		t.Fatalf("list = %+v, %v", got, err)
	}
}

func TestUpsertRejectsInvalidAndUnknownWithoutWriting(t *testing.T) {
	w := setup(t)
	_, err := w.upsert(svc.AnswerInput{IndicatorCode: indicator, X: f(1)}, svc.AnswerInput{IndicatorCode: "ZZ-ZZ-9"})
	var v *svc.AnswerValidationError
	if !errors.As(err, &v) || v.Fields[0].Field != "/answers/1/indicator_code" || v.Fields[0].Code != "unknown_indicator" {
		t.Fatalf("err = %v", err)
	}
	l, _ := w.s.List(context.Background(), w.owner, w.project, w.v1)
	if len(l.Items) != 0 {
		t.Fatalf("nothing should be saved, got %+v", l.Items)
	}
}

func TestNotOwnedIs404AndOlderVersionIs409(t *testing.T) {
	w := setup(t)
	other := uuid.MustParse(testutil.NewAccount(t, w.pool).ID)
	in := []svc.AnswerInput{{IndicatorCode: indicator}}
	if _, err := w.s.Upsert(context.Background(), other, w.project, w.v1, in, at); !errors.Is(err, svc.ErrAnswerVersionNotFound) {
		t.Fatalf("other owner: err = %v", err)
	}
	if _, err := w.s.List(context.Background(), other, w.project, w.v1); !errors.Is(err, svc.ErrAnswerVersionNotFound) {
		t.Fatalf("other owner list: err = %v", err)
	}
	// A second version makes the first read-only.
	testutil.NewVersionWithSnapshot(t, w.pool, w.project.String())
	if _, err := w.upsert(in...); !errors.Is(err, svc.ErrAnswerNotEditable) {
		t.Fatalf("older version: err = %v", err)
	}
	l, err := w.s.List(context.Background(), w.owner, w.project, w.v1)
	if err != nil || l.Editable {
		t.Fatalf("list = %+v, %v", l, err)
	}
}

func TestUpsertEmptyListWritesNothing(t *testing.T) {
	w := setup(t)
	l, err := w.upsert()
	if err != nil || len(l.Items) != 0 || !l.Editable {
		t.Fatalf("empty upsert = %+v, %v", l, err)
	}
}

func TestUpsertManyRemovesY3AndOverwritesInOneCall(t *testing.T) {
	w := setup(t)
	ctx := context.Background()
	codes := []string{"EC-MG-1", "EC-MG-2", "EC-MG-3"}
	full := func(code string, y3 ...string) svc.AnswerInput {
		return svc.AnswerInput{
			IndicatorCode: code, X: f(0.1),
			Y1: &svc.Impact{Value: 1000, Unit: "baht"}, Y2: &svc.Impact{Value: 5, Unit: "day"}, Y3: y3,
		}
	}
	if _, err := w.upsert(full(codes[0], "A"), full(codes[1], "B", "C"), full(codes[2], "D")); err != nil {
		t.Fatal(err)
	}
	// Second call: one gets different options, one loses its y3, one is
	// reduced to x only, so units and y3 become NULL / empty.
	l, err := w.upsert(
		full(codes[0], "E"),
		full(codes[1]),
		svc.AnswerInput{IndicatorCode: codes[2], X: f(2)},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Items) != 3 {
		t.Fatalf("items = %+v", l.Items)
	}
	by := map[string]svc.Answer{}
	for _, a := range l.Items {
		by[a.IndicatorCode] = a
	}
	if a := by[codes[0]]; len(a.Y3) != 1 || a.Y3[0] != "E" || !a.Complete {
		t.Fatalf("%s = %+v", codes[0], a)
	}
	if a := by[codes[1]]; len(a.Y3) != 0 || a.Complete || *a.X != 0.1 {
		t.Fatalf("%s = %+v", codes[1], a)
	}
	if a := by[codes[2]]; a.Y1 != nil || a.Y2 != nil || *a.X != 2 || len(a.Y3) != 0 {
		t.Fatalf("%s = %+v", codes[2], a)
	}
	var n int
	if err := w.pool.QueryRow(ctx, `SELECT count(*) FROM answer_y3 WHERE version_id = $1`, w.v1).Scan(&n); err != nil || n != 1 {
		t.Fatalf("answer_y3 rows = %d, %v; want 1", n, err)
	}
}
