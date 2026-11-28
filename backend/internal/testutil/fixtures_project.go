package testutil

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

// nickSeq gives each default project its own nickname: an owner cannot have
// two live projects with the same nickname.
var nickSeq atomic.Int64

// Project is a row of the project table.
type Project struct {
	ID        string
	OwnerID   string
	Name      string
	Nickname  string
	Island    string
	Type      string
	StartDate time.Time
	EndDate   time.Time
	ValueBaht string
}

// NewProject inserts a project owned by ownerID: Koh Tao, building,
// 100 million baht, two years, and a nickname no other default project has.
func NewProject(t testing.TB, db DB, ownerID string, opts ...func(*Project)) Project {
	t.Helper()
	p := Project{
		ID: NewID(), OwnerID: ownerID, Name: "Test project", Nickname: fmt.Sprintf("T%03d", nickSeq.Add(1)%1000),
		Island: "koh_tao", Type: "building",
		StartDate: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2028, 12, 31, 0, 0, 0, 0, time.UTC),
		ValueBaht: "100000000.00",
	}
	for _, o := range opts {
		o(&p)
	}
	_, err := db.Exec(context.Background(), `
		INSERT INTO project (id, owner_id, name, nickname, island_code, type_code,
			start_date, end_date, value_baht)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		p.ID, p.OwnerID, p.Name, p.Nickname, p.Island, p.Type, p.StartDate, p.EndDate, p.ValueBaht)
	must(t, err, "project")
	return p
}
