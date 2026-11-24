package testutil

import (
	"context"
	"testing"
)

// Account is a row of the account table.
type Account struct {
	ID        string
	Email     string
	Pseudonym string
	Role      string
}

// NewAccount inserts an active account with a password. Each option may
// change the defaults before the insert.
func NewAccount(t testing.TB, db DB, opts ...func(*Account)) Account {
	t.Helper()
	id := NewID()
	a := Account{ID: id, Email: id + "@example.test", Pseudonym: "user-" + id[:8], Role: "user"}
	for _, o := range opts {
		o(&a)
	}
	_, err := db.Exec(context.Background(), `
		INSERT INTO account (id, email, password_hash, role, pseudonym, terms_accepted_at)
		VALUES ($1, $2, 'hash', $3::user_role, $4, now())`,
		a.ID, a.Email, a.Role, a.Pseudonym)
	must(t, err, "account")
	return a
}
