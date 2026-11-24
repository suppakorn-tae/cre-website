package dal_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
)

type fakeTx struct {
	pgx.Tx
	committed  bool
	rolledBack bool
}

func (t *fakeTx) Commit(context.Context) error   { t.committed = true; return nil }
func (t *fakeTx) Rollback(context.Context) error { t.rolledBack = true; return nil }

type fakeDB struct{ tx *fakeTx }

func (d fakeDB) Begin(context.Context) (pgx.Tx, error) { return d.tx, nil }

func TestWithTxCommitsOnSuccess(t *testing.T) {
	tx := &fakeTx{}
	if err := dal.WithTx(context.Background(), fakeDB{tx}, func(pgx.Tx) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !tx.committed || tx.rolledBack {
		t.Fatalf("committed=%v rolledBack=%v", tx.committed, tx.rolledBack)
	}
}

func TestWithTxRollsBackOnError(t *testing.T) {
	tx := &fakeTx{}
	want := errors.New("boom")
	err := dal.WithTx(context.Background(), fakeDB{tx}, func(pgx.Tx) error { return want })
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
	if tx.committed || !tx.rolledBack {
		t.Fatalf("committed=%v rolledBack=%v", tx.committed, tx.rolledBack)
	}
}

func TestWithTxRollsBackAndRepanics(t *testing.T) {
	tx := &fakeTx{}
	defer func() {
		if r := recover(); r != "kaboom" {
			t.Fatalf("recovered %v, want kaboom", r)
		}
		if tx.committed || !tx.rolledBack {
			t.Fatalf("committed=%v rolledBack=%v", tx.committed, tx.rolledBack)
		}
	}()
	_ = dal.WithTx(context.Background(), fakeDB{tx}, func(pgx.Tx) error { panic("kaboom") })
}
